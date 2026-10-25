/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar, ScreenTab } from './components/Navbar';
import { SearchScreen } from './components/SearchScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ExportScreen } from './components/ExportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { PlaceRecord, ScrapeJob } from './shared/types';

export default function App() {
  const [currentTab, setCurrentTab] = useState<ScreenTab>('search');

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

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erro ao iniciar coleta.');
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

  return (
    <div className="min-h-screen bg-zinc-50/50 text-zinc-900 flex flex-col font-sans antialiased">
      {/* Top Navigation Bar */}
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        totalPlaces={totalPlaces}
        selectedCount={selectedPlaceIds.size}
        isScrapingActive={isScraping}
      />

      {/* Main Screen Content (Strictly 4 screens) */}
      <main className="flex-1">
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
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-400">
        <p>MapScrape &mdash; Extração direta de fichas do Google Maps com Puppeteer e SQLite.</p>
      </footer>
    </div>
  );
}
