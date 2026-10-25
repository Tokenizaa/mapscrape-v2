import React, { useState } from 'react';
import { Play, Square, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Building2, MapPin, Hash } from 'lucide-react';
import { ScrapeJob } from '../shared/types';

interface SearchScreenProps {
  currentJob: ScrapeJob | null;
  isScraping: boolean;
  onStartScrape: (segment: string, location: string, limit: number) => Promise<void>;
  onStopScrape: () => Promise<void>;
  onGoToResults: () => void;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  currentJob,
  isScraping,
  onStartScrape,
  onStopScrape,
  onGoToResults,
}) => {
  const [segment, setSegment] = useState('');
  const [location, setLocation] = useState('');
  const [limit, setLimit] = useState(20);
  const [validationError, setValidationError] = useState('');

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segment.trim()) {
      setValidationError('Informe o segmento ou tipo de estabelecimento.');
      return;
    }
    if (!location.trim()) {
      setValidationError('Informe a cidade, bairro ou região.');
      return;
    }
    setValidationError('');
    await onStartScrape(segment, location, limit);
  };

  const limitPresets = [10, 20, 50, 100];

  const calculateProgressPercent = (): number => {
    if (!currentJob) return 0;
    if (currentJob.status === 'completed') return 100;
    const target = currentJob.limit_requested || 20;
    const current = (currentJob.total_collected || 0) + (currentJob.total_duplicates || 0);
    return Math.min(Math.round((current / target) * 100), 99);
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      {/* Intro Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 tracking-tight">
          Pesquisar no Google Maps
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-600">
          Informe o tipo de estabelecimento e a localização desejada. O Chromium abrirá a página pública do Google Maps, percorrerá os resultados e extrairá os dados oficiais de cada ficha para o SQLite.
        </p>
      </div>

      {/* Main Search Form Card */}
      <div className="bg-white border border-zinc-200 rounded-xl shadow-xs p-6 sm:p-8">
        <form onSubmit={handleStart} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Campo 1: Segmento */}
            <div>
              <label htmlFor="segment" className="block text-sm font-medium text-zinc-800 mb-2">
                Segmento ou tipo de estabelecimento <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <input
                  id="segment"
                  type="text"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  disabled={isScraping}
                  placeholder="Ex: Padarias artesanais, Clínicas veterinárias"
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>
            </div>

            {/* Campo 2: Localização */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-zinc-800 mb-2">
                Cidade, bairro ou região <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <input
                  id="location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={isScraping}
                  placeholder="Ex: Pinheiros, São Paulo - SP"
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* Campo 3: Limite de resultados */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="limit" className="block text-sm font-medium text-zinc-800">
                Limite de resultados desejado
              </label>
              <span className="text-xs text-zinc-500">Máximo recomendado: 100 por consulta</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-32">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <Hash className="w-4 h-4" />
                </div>
                <input
                  id="limit"
                  type="number"
                  min="1"
                  max="100"
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value))))}
                  disabled={isScraping}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white disabled:opacity-60"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5">
                {limitPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLimit(preset)}
                    disabled={isScraping}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      limit === preset
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {validationError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {validationError}
            </div>
          )}

          {/* Primary Action Button (Big & Prominent) */}
          <div className="pt-2">
            {!isScraping ? (
              <button
                type="submit"
                className="w-full py-4 px-6 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-base rounded-xl shadow-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Iniciar coleta no Google Maps</span>
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 py-4 px-6 bg-zinc-100 border border-zinc-200 text-zinc-700 font-medium text-sm rounded-xl flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-700" />
                  <span>Coleta em andamento pelo Puppeteer...</span>
                </div>
                <button
                  type="button"
                  onClick={onStopScrape}
                  className="py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Interromper</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Real-time Progress & Metrics Panel */}
      {currentJob && (
        <div className="mt-8 bg-white border border-zinc-200 rounded-xl shadow-xs p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-zinc-900">Status da Execução</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  currentJob.status === 'running'
                    ? 'bg-amber-100 text-amber-800'
                    : currentJob.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : currentJob.status === 'stopped'
                    ? 'bg-zinc-100 text-zinc-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {currentJob.status === 'running' && 'Em andamento'}
                {currentJob.status === 'completed' && 'Concluída'}
                {currentJob.status === 'stopped' && 'Interrompida'}
                {currentJob.status === 'failed' && 'Falha'}
              </span>
            </div>

            {currentJob.total_collected > 0 && (
              <button
                type="button"
                onClick={onGoToResults}
                className="text-xs font-medium text-zinc-900 hover:text-zinc-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50"
              >
                <span>Ver resultados coletados</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-zinc-600 mb-1.5">
              <span className="font-medium text-zinc-800">
                {currentJob.current_step || 'Aguardando...'}
              </span>
              <span className="font-mono">{calculateProgressPercent()}%</span>
            </div>
            <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  currentJob.status === 'failed'
                    ? 'bg-red-500'
                    : currentJob.status === 'stopped'
                    ? 'bg-zinc-400'
                    : 'bg-zinc-900'
                }`}
                style={{ width: `${calculateProgressPercent()}%` }}
              />
            </div>
          </div>

          {/* The 4 Compulsory Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Encontrados */}
            <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-lg text-center">
              <span className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Encontrados
              </span>
              <span className="block text-2xl font-semibold text-zinc-900 mt-1 font-mono">
                {currentJob.total_found}
              </span>
            </div>

            {/* Coletados */}
            <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-lg text-center">
              <span className="block text-xs font-medium text-emerald-800 uppercase tracking-wider">
                Coletados
              </span>
              <span className="block text-2xl font-semibold text-emerald-900 mt-1 font-mono">
                {currentJob.total_collected}
              </span>
            </div>

            {/* Duplicados */}
            <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-lg text-center">
              <span className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Duplicados
              </span>
              <span className="block text-2xl font-semibold text-zinc-700 mt-1 font-mono">
                {currentJob.total_duplicates}
              </span>
            </div>

            {/* Erros */}
            <div className="p-4 bg-red-50/50 border border-red-200/80 rounded-lg text-center">
              <span className="block text-xs font-medium text-red-800 uppercase tracking-wider">
                Erros
              </span>
              <span className="block text-2xl font-semibold text-red-900 mt-1 font-mono">
                {currentJob.total_errors}
              </span>
            </div>
          </div>

          {/* Status Message / Audit Log */}
          {currentJob.status_message && (
            <div className="mt-5 text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg p-3 flex items-start gap-2">
              {currentJob.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : currentJob.status === 'failed' ? (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-zinc-400 shrink-0 mt-1.5 ml-1" />
              )}
              <span className="leading-relaxed">{currentJob.status_message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
