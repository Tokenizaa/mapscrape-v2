/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar, ScreenTab } from './components/Sidebar';
import { SearchScreen } from './components/SearchScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ExportScreen } from './components/ExportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { LogsScreen } from './components/LogsScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { ProjectsScreen } from './components/ProjectsScreen';
import { CredentialsScreen } from './components/CredentialsScreen';
import { PlaceRecord, ScrapeJob } from './shared/types';
import { Menu, ChevronRight, Activity, Database, FileSpreadsheet } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<ScreenTab>('dashboard');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(() => Boolean(window.sessionStorage.getItem('mapscrape_api_key')));
  const [apiKeyError, setApiKeyError] = useState('');
  const [isConnectingApi, setIsConnectingApi] = useState(false);

  const handleConnectApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    const key = apiKeyInput.trim();
    if (!key) return;
    setIsConnectingApi(true);
    setApiKeyError('');
    window.sessionStorage.setItem('mapscrape_api_key', key);
    try {
      const response = await fetch('/api/history', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Chave de API inválida ou revogada.' : `Falha de autenticação (HTTP ${response.status}).`);
      setHasApiKey(true);
      setApiKeyInput('');
      await loadHistory();
      await loadPlaces();
    } catch (error) {
      window.sessionStorage.removeItem('mapscrape_api_key');
      setHasApiKey(false);
      setApiKeyError(error instanceof Error ? error.message : 'Não foi possível validar a chave.');
    } finally {
      setIsConnectingApi(false);
    }
  };

  const handleDisconnectApiKey = () => {
    window.sessionStorage.removeItem('mapscrape_api_key');
    setHasApiKey(false);
    setJobs([]);
    setPlaces([]);
    setTotalPlaces(0);
    setApiKeyInput('');
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Active or most recent job
  const [currentJob, setCurrentJob] = useState<ScrapeJob | null>(null);
  const [isScraping, setIsScraping] = useState<boolean>(false);

  // History list
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);

  // Results state
  const [places, setPlaces] = useState<PlaceRecord[]>([]);
  const [totalPlaces, setTotalPlaces] = useState<number>(0);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('collected_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState<boolean>(false);

  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load past searches history
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, []);

  // Load places for table
  const loadPlaces = useCallback(async () => {
    setIsLoadingPlaces(true);
    try {
      const offset = (currentPage - 1) * pageSize;
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(pageSize),
        sortBy,
        sortOrder,
      });

      if (selectedJobId) params.append('jobId', selectedJobId);
      if (searchQuery.trim()) params.append('query', searchQuery.trim());
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await fetch(`/api/places?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPlaces(data.places || []);
        setTotalPlaces(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load places:', err);
    } finally {
      setIsLoadingPlaces(false);
    }
  }, [currentPage, pageSize, sortBy, sortOrder, selectedJobId, searchQuery, categoryFilter]);

  // Initial load
  useEffect(() => {
    loadHistory();
    loadPlaces();
  }, [loadHistory, loadPlaces]);

  // Poll persistent job state. Serverless instances do not share in-memory SSE clients.
  const subscribeToJobStream = useCallback((jobId: string) => {
    if (progressPollRef.current) clearInterval(progressPollRef.current);

    let consecutiveErrors = 0;
    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/scrape/status/${encodeURIComponent(jobId)}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
        }

        const updatedJob = await res.json() as ScrapeJob & { isRunning?: boolean };
        consecutiveErrors = 0;
        setCurrentJob(updatedJob);
        setIsScraping(updatedJob.status === 'running');
        await loadHistory();
        await loadPlaces();

        if (updatedJob.status !== 'running') {
          if (progressPollRef.current) clearInterval(progressPollRef.current);
          progressPollRef.current = null;
        }
      } catch (err) {
        consecutiveErrors++;
        console.error('Falha ao consultar progresso da coleta:', err);
        if (consecutiveErrors >= 5) {
          if (progressPollRef.current) clearInterval(progressPollRef.current);
          progressPollRef.current = null;
          setIsScraping(false);
          await loadHistory();
        }
      }
    };

    void pollStatus();
    progressPollRef.current = setInterval(() => { void pollStatus(); }, 2000);
  }, [loadHistory, loadPlaces]);

  // Clean up progress polling on unmount
  useEffect(() => {
    return () => {
      if (progressPollRef.current) clearInterval(progressPollRef.current);
    };
  }, []);

  // Handlers
  const handleStartScrape = async (projectName: string, categoryName: string, segment: string, location: string, limit: number) => {
    try {
      const res = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, categoryName, segment, location, limit }),
      });

      const contentType = res.headers.get('content-type') || '';
      const responseText = await res.text();
      let data: { error?: string; jobId?: string; message?: string } | null = null;

      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        const detail = data?.error || data?.message ||
          (responseText.trim().startsWith('<')
            ? 'O servidor retornou uma página HTML em vez de JSON. Verifique o roteamento da API na Vercel.'
            : responseText.trim().slice(0, 240));
        alert(`Falha ao iniciar coleta (HTTP ${res.status}): ${detail || res.statusText}`);
        return;
      }

      if (!data || typeof data.jobId !== 'string' || !data.jobId) {
        alert(`Resposta inválida do servidor (HTTP ${res.status}). Esperava JSON com jobId; Content-Type: ${contentType || 'ausente'}.`);
        return;
      }

      setIsScraping(true);
      setSelectedJobId(data.jobId);
      subscribeToJobStream(data.jobId);
      loadHistory();
    } catch (err: any) {
      alert(`Falha na comunicação com o servidor: ${err.message}`);
    }
  };

  const handleStopScrape = async () => {
    if (!currentJob) return;
    try {
      await fetch(`/api/scrape/stop/${currentJob.id}`, { method: 'POST' });
    } catch (err: any) {
      console.error('Stop error:', err);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/history/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedJobId === jobId) {
          setSelectedJobId(undefined);
        }
        if (currentJob?.id === jobId) {
          setCurrentJob(null);
        }
        await loadHistory();
        await loadPlaces();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleToggleSelectPlace = (id: string) => {
    const next = new Set(selectedPlaceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPlaceIds(next);
  };

  const handleToggleSelectAll = (allIds: string[]) => {
    const next = new Set(selectedPlaceIds);
    const allSelected = allIds.every((id) => next.has(id));
    if (allSelected) {
      allIds.forEach((id) => next.delete(id));
    } else {
      allIds.forEach((id) => next.add(id));
    }
    setSelectedPlaceIds(next);
  };

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const tabLabels: Record<ScreenTab, string> = {
    dashboard: 'Visão geral',
    projects: 'Projetos',
    credentials: 'Credenciais de API',
    search: 'Pesquisar',
    results: 'Resultados',
    export: 'Exportar CSV',
    history: 'Histórico',
    logs: 'Auditoria & Logs',
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        totalPlaces={totalPlaces}
        selectedCount={selectedPlaceIds.size}
        isScrapingActive={isScraping}
        currentJob={currentJob}
        onStopScrape={handleStopScrape}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area with Desktop Sidebar Offset */}
      <div className="lg:pl-72 flex-1 flex flex-col min-w-0">
        {/* Minimalist Linear / Stripe Top Bar */}
        <header className="h-16 px-4 sm:px-8 border-b border-zinc-850/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition-colors"
              aria-label="Abrir menu lateral"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Contextual Breadcrumb trail */}
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-zinc-400">MapScrape</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              <span className="font-medium text-zinc-100 text-base">{tabLabels[currentTab]}</span>
            </div>
          </div>

          {/* Top Actions & Quick Indicators */}
          <div className="flex items-center gap-3">
            {isScraping && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span>Coleta ativa</span>
              </div>
            )}

            {totalPlaces > 0 && currentTab !== 'results' && (
              <button
                type="button"
                onClick={() => setCurrentTab('results')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-850 text-xs font-medium transition-colors"
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>{totalPlaces} salvos</span>
              </button>
            )}

            {selectedPlaceIds.size > 0 && currentTab !== 'export' && (
              <button
                type="button"
                onClick={() => setCurrentTab('export')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm shadow-emerald-950/40"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Exportar ({selectedPlaceIds.size})</span>
              </button>
            )}
          </div>
        </header>

        {/* Screen Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-10">
          {!hasApiKey ? (
            <section className="mx-auto mb-8 max-w-3xl rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
              <h2 className="text-lg font-semibold text-zinc-100">Conectar à API do MapScrape</h2>
              <p className="mt-1 text-sm text-zinc-400">Insira uma chave de consumidor emitida em Credenciais de API. A chave fica apenas nesta aba e não é incorporada ao código.</p>
              <form onSubmit={handleConnectApiKey} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input aria-label="Chave de API" type="password" autoComplete="off" value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} placeholder="Chave de API (Bearer)" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" />
                <button disabled={!apiKeyInput.trim() || isConnectingApi} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isConnectingApi ? 'Validando…' : 'Conectar'}</button>
              </form>
              {apiKeyError && <p role="alert" className="mt-3 text-sm text-rose-300">{apiKeyError}</p>}
              <button type="button" onClick={() => setCurrentTab('credentials')} className="mt-3 text-sm font-medium text-emerald-400 hover:text-emerald-300">Abrir Credenciais de API</button>
            </section>
          ) : (
            <div className="mb-4 flex justify-end">
              <button type="button" onClick={handleDisconnectApiKey} className="text-xs text-zinc-500 hover:text-zinc-200">Desconectar chave desta aba</button>
            </div>
          )}
          {currentTab === 'dashboard' && <DashboardScreen totalPlaces={totalPlaces} jobs={jobs} currentJob={currentJob} isScraping={isScraping} onNavigate={setCurrentTab} />}

          {currentTab === 'projects' && <ProjectsScreen jobs={jobs} apiReady={hasApiKey} onNewScrape={() => setCurrentTab('search')} onOpenJob={(jobId) => { setSelectedJobId(jobId); setCurrentPage(1); setCurrentTab('results'); }} />}

          {currentTab === 'credentials' && <CredentialsScreen />}

          {currentTab === 'search' && (
            <SearchScreen
              currentJob={currentJob}
              isScraping={isScraping}
              apiReady={hasApiKey}
              onStartScrape={handleStartScrape}
              onStopScrape={handleStopScrape}
              onGoToResults={() => setCurrentTab('results')}
            />
          )}

          {currentTab === 'results' && (
            <ResultsScreen
              places={places}
              totalPlaces={totalPlaces}
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJobId={setSelectedJobId}
              selectedPlaceIds={selectedPlaceIds}
              onToggleSelectPlace={handleToggleSelectPlace}
              onToggleSelectAll={handleToggleSelectAll}
              onGoToExport={() => setCurrentTab('export')}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              selectedCategory={categoryFilter}
              onCategoryChange={(value) => { setCategoryFilter(value); setCurrentPage(1); }}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              isLoading={isLoadingPlaces}
            />
          )}

          {currentTab === 'export' && (
            <ExportScreen
              places={places}
              totalPlaces={totalPlaces}
              selectedPlaceIds={selectedPlaceIds}
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJobId={setSelectedJobId}
            />
          )}

          {currentTab === 'history' && (
            <HistoryScreen
              jobs={jobs}
              onViewResults={(jobId) => {
                setSelectedJobId(jobId);
                setCurrentTab('results');
              }}
              onGoToExportWithJob={(jobId) => {
                setSelectedJobId(jobId);
                setCurrentTab('export');
              }}
              onDeleteJob={handleDeleteJob}
            />
          )}

          {currentTab === 'logs' && <LogsScreen />}
        </main>

        {/* Minimal Footer */}
        <footer className="border-t border-zinc-850/80 py-5 px-6 text-center text-xs text-zinc-400">
          <p>MapScrape &mdash; Extração direta e transparente de fichas públicas do Google Maps com Puppeteer e SQLite.</p>
        </footer>
      </div>
    </div>
  );
}

