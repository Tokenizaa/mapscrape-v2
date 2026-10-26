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
import { PlaceRecord, ScrapeJob } from './shared/types';
import { Menu, ChevronRight, Activity, Database, FileSpreadsheet } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<ScreenTab>('search');
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
  const [sortBy, setSortBy] = useState<string>('collected_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

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
  }, [currentPage, pageSize, sortBy, sortOrder, selectedJobId, searchQuery]);

  // Initial load
  useEffect(() => {
    loadHistory();
    loadPlaces();
  }, [loadHistory, loadPlaces]);

  // Real-time EventSource listener for active job
  const subscribeToJobStream = useCallback((jobId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/scrape/stream/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const updatedJob: ScrapeJob = JSON.parse(event.data);
        setCurrentJob(updatedJob);

        if (updatedJob.status === 'running') {
          setIsScraping(true);
        } else {
          setIsScraping(false);
          es.close();
          eventSourceRef.current = null;
          loadHistory();
        }

        // Refresh places in background if new items were collected
        loadPlaces();
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [loadHistory, loadPlaces]);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Handlers
  const handleStartScrape = async (segment: string, location: string, limit: number) => {
    try {
      const res = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, location, limit }),
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
          {currentTab === 'search' && (
            <SearchScreen
              currentJob={currentJob}
              isScraping={isScraping}
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

