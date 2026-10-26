import React, { useState } from 'react';
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Building2,
  MapPin,
  Hash,
  Sparkles,
  Compass,
} from 'lucide-react';
import { ScrapeJob } from '../shared/types';
import { BRAZILIAN_STATES, POPULAR_CATEGORIES } from '../shared/brazilLocations';

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
  const [locationMode, setLocationMode] = useState<'brazil' | 'custom'>('brazil');

  // Brazil selector state
  const [selectedUf, setSelectedUf] = useState<string>('SP');
  const [selectedCity, setSelectedCity] = useState<string>('São Paulo');
  const [neighborhood, setNeighborhood] = useState<string>('');

  // Custom location state
  const [customLocation, setCustomLocation] = useState<string>('');

  // Active category group tab
  const [activeCategoryGroup, setActiveCategoryGroup] = useState<number>(0);
  const [showCategories, setShowCategories] = useState<boolean>(true);

  const [limit, setLimit] = useState<number>(20);
  const [validationError, setValidationError] = useState('');

  // Find current state
  const currentState = BRAZILIAN_STATES.find((s) => s.uf === selectedUf) || BRAZILIAN_STATES[0];

  // When state changes, default to first city
  const handleUfChange = (uf: string) => {
    setSelectedUf(uf);
    const stateObj = BRAZILIAN_STATES.find((s) => s.uf === uf);
    if (stateObj && stateObj.cities.length > 0) {
      setSelectedCity(stateObj.cities[0]);
    }
  };

  // Compute final location string
  const getComputedLocation = (): string => {
    if (locationMode === 'custom') {
      return customLocation.trim();
    }
    const parts: string[] = [];
    if (neighborhood.trim()) {
      parts.push(neighborhood.trim());
    }
    if (selectedCity) {
      parts.push(selectedCity);
    }
    if (selectedUf) {
      parts.push(selectedUf);
    }
    return parts.join(', ');
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segment.trim()) {
      setValidationError('Informe ou selecione o segmento ou tipo de estabelecimento.');
      return;
    }
    const finalLoc = getComputedLocation();
    if (!finalLoc) {
      setValidationError('Selecione ou digite a cidade, bairro ou região.');
      return;
    }
    setValidationError('');
    await onStartScrape(segment.trim(), finalLoc, limit);
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
    <div className="max-w-5xl mx-auto py-2 sm:py-6 space-y-8">
      {/* Intro Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Compass className="w-3.5 h-3.5" />
          <span>Pesquisa Automatizada de Estabelecimentos</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-zinc-100 tracking-tight leading-tight">
          Pesquisar no Google Maps
        </h1>
        <p className="mt-3 text-base sm:text-lg text-zinc-400 max-w-3xl leading-relaxed">
          Selecione a categoria e a localização desejada no Brasil (ou insira uma personalizada). O Puppeteer percorrerá a página pública do Google Maps e extrairá fichas reais com fotos, vídeos, logo, contatos, avaliações e horários para persistência no SQLite.
        </p>
      </div>

      {/* Main Search Form Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl shadow-black/40 p-6 sm:p-9 space-y-8 backdrop-blur-sm">
        <form onSubmit={handleStart} className="space-y-8">
          
          {/* Seção 1: Segmento do Estabelecimento */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="segment" className="block text-base sm:text-lg font-semibold text-zinc-100">
                1. Tipo de Estabelecimento ou Nicho <span className="text-emerald-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowCategories(!showCategories)}
                className="text-xs sm:text-sm font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{showCategories ? 'Ocultar sugestões' : 'Ver sugestões populares'}</span>
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                <Building2 className="w-5 h-5" />
              </div>
              <input
                id="segment"
                type="text"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                disabled={isScraping}
                placeholder="Ex: Clínicas Odontológicas, Hamburguerias, Pet Shops, Padarias..."
                className="w-full pl-12 pr-4 py-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-base sm:text-lg font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all disabled:opacity-50"
              />
            </div>

            {/* Popular Categories Visual Selector */}
            {showCategories && (
              <div className="pt-2 bg-zinc-950/60 border border-zinc-800/90 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sugestões Rápidas de Categorias Comerciais</span>
                </div>

                {/* Category Group Tabs */}
                <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-2.5">
                  {POPULAR_CATEGORIES.map((cat, idx) => (
                    <button
                      key={cat.group}
                      type="button"
                      onClick={() => setActiveCategoryGroup(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        activeCategoryGroup === idx
                          ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm'
                          : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                      }`}
                    >
                      {cat.group}
                    </button>
                  ))}
                </div>

                {/* Category Chips in Selected Group */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {POPULAR_CATEGORIES[activeCategoryGroup]?.items.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSegment(item)}
                      disabled={isScraping}
                      className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-all cursor-pointer ${
                        segment === item
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Seção 2: Localização */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-base sm:text-lg font-semibold text-zinc-100">
                2. Localização <span className="text-emerald-400">*</span>
              </label>

              {/* Mode Switcher: Brazil Selector vs Custom */}
              <div className="flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setLocationMode('brazil')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                    locationMode === 'brazil'
                      ? 'bg-zinc-850 text-zinc-100 shadow-xs border border-zinc-750'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Brasil (Estado & Cidade)
                </button>
                <button
                  type="button"
                  onClick={() => setLocationMode('custom')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                    locationMode === 'custom'
                      ? 'bg-zinc-850 text-zinc-100 shadow-xs border border-zinc-750'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Digitação Livre
                </button>
              </div>
            </div>

            {locationMode === 'brazil' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Estado (UF) */}
                <div>
                  <label htmlFor="state-select" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Estado (UF)
                  </label>
                  <select
                    id="state-select"
                    value={selectedUf}
                    onChange={(e) => handleUfChange(e.target.value)}
                    disabled={isScraping}
                    className="w-full py-3.5 px-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  >
                    {BRAZILIAN_STATES.map((st) => (
                      <option key={st.uf} value={st.uf} className="bg-zinc-900 text-zinc-100">
                        {st.name} ({st.uf})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cidade */}
                <div>
                  <label htmlFor="city-select" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Cidade
                  </label>
                  <select
                    id="city-select"
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    disabled={isScraping}
                    className="w-full py-3.5 px-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  >
                    {currentState.cities.map((city) => (
                      <option key={city} value={city} className="bg-zinc-900 text-zinc-100">
                        {city}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bairro ou Região (Opcional) */}
                <div>
                  <label htmlFor="neighborhood-input" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Bairro ou Região <span className="text-zinc-500 font-normal">(opcional)</span>
                  </label>
                  <input
                    id="neighborhood-input"
                    type="text"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    disabled={isScraping}
                    placeholder="Ex: Pinheiros, Centro, Batel..."
                    className="w-full py-3.5 px-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-sm sm:text-base font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    disabled={isScraping}
                    placeholder="Ex: Pinheiros, São Paulo - SP ou Copacabana, Rio de Janeiro..."
                    className="w-full pl-12 pr-4 py-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-base sm:text-lg font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Visual Location Preview */}
            <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Localização resultante da pesquisa:{' '}
                <strong className="text-zinc-200 font-semibold">{getComputedLocation() || '(Aguardando preenchimento)'}</strong>
              </span>
            </div>
          </div>

          {/* Seção 3: Limite de Resultados Desejado */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="limit" className="block text-base sm:text-lg font-semibold text-zinc-100">
                3. Quantidade de Resultados Desejada
              </label>
              <span className="text-xs sm:text-sm text-zinc-500">
                Recomendado: 10 a 50 estabelecimentos por consulta
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-36">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
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
                  className="w-full pl-10 pr-3 py-3 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              {/* Presets */}
              <div className="flex items-center gap-2">
                {limitPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLimit(preset)}
                    disabled={isScraping}
                    className={`px-4 py-2.5 text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
                      limit === preset
                        ? 'bg-zinc-800 text-zinc-100 border-zinc-650 shadow-xs'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200'
                    }`}
                  >
                    {preset} fichas
                  </button>
                ))}
              </div>
            </div>
          </div>

          {validationError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm font-medium text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="pt-4 border-t border-zinc-800">
            {!isScraping ? (
              <button
                type="submit"
                className="w-full py-4 sm:py-5 px-8 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-lg sm:text-xl rounded-2xl shadow-lg shadow-emerald-950/50 hover:shadow-emerald-900/60 transition-all duration-150 flex items-center justify-center gap-3 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>Iniciar Coleta no Google Maps</span>
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <div className="flex-1 py-4 sm:py-5 px-6 bg-zinc-950 border border-zinc-800 text-zinc-300 font-semibold text-base sm:text-lg rounded-2xl flex items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  <span>Coleta em andamento pelo Puppeteer...</span>
                </div>
                <button
                  type="button"
                  onClick={onStopScrape}
                  className="py-4 sm:py-5 px-8 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-base sm:text-lg rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Square className="w-5 h-5 fill-current" />
                  <span>Interromper</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Real-time Progress & Metrics Panel with Large Numbers */}
      {currentJob && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl shadow-black/40 p-6 sm:p-9 space-y-6 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-zinc-100">Progresso da Coleta</h2>
              <span
                className={`text-xs sm:text-sm px-3 py-1 rounded-full font-bold uppercase tracking-wide border ${
                  currentJob.status === 'running'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse'
                    : currentJob.status === 'completed'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : currentJob.status === 'partial'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : currentJob.status === 'stopped'
                    ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                }`}
              >
                {currentJob.status === 'running' && 'Em andamento'}
                {currentJob.status === 'completed' && 'Concluída'}
                {currentJob.status === 'partial' && 'Parcial'}
                {currentJob.status === 'stopped' && 'Interrompida'}
                {currentJob.status === 'failed' && 'Falha'}
              </span>
            </div>

            {currentJob.total_collected > 0 && (
              <button
                type="button"
                onClick={onGoToResults}
                className="text-sm font-semibold text-zinc-200 hover:text-white bg-zinc-800 hover:bg-zinc-700 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 transition-all cursor-pointer"
              >
                <span>Ver {currentJob.total_collected} resultados salvos</span>
                <ArrowRight className="w-4 h-4 text-emerald-400" />
              </button>
            )}
          </div>

          {/* Progress Bar & Percentage */}
          <div>
            <div className="flex justify-between items-baseline text-sm sm:text-base text-zinc-400 mb-2 font-medium">
              <span className="truncate pr-4 text-zinc-200 font-medium">
                {currentJob.current_step || 'Aguardando inicialização do navegador...'}
              </span>
              <span className="font-mono text-xl font-bold text-emerald-400 shrink-0 tabular-nums">
                {calculateProgressPercent()}%
              </span>
            </div>
            <div className="w-full bg-zinc-950 h-3 rounded-full overflow-hidden border border-zinc-800">
              <div
                className={`h-full transition-all duration-300 ${
                  currentJob.status === 'failed'
                    ? 'bg-rose-500'
                    : currentJob.status === 'partial'
                    ? 'bg-amber-500'
                    : currentJob.status === 'stopped'
                    ? 'bg-zinc-600'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${calculateProgressPercent()}%` }}
              />
            </div>
          </div>

          {/* The 4 Compulsory Counters with Large Readable Fonts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Encontrados */}
            <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-xl text-center">
              <span className="block text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider">
                Encontrados
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold text-zinc-100 mt-2 font-mono tabular-nums">
                {currentJob.total_found}
              </span>
            </div>

            {/* Coletados */}
            <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
              <span className="block text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider">
                Coletados
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold text-emerald-300 mt-2 font-mono tabular-nums">
                {currentJob.total_collected}
              </span>
            </div>

            {/* Duplicados */}
            <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-xl text-center">
              <span className="block text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider">
                Duplicados
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold text-zinc-300 mt-2 font-mono tabular-nums">
                {currentJob.total_duplicates}
              </span>
            </div>

            {/* Erros */}
            <div className="p-5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-center">
              <span className="block text-xs sm:text-sm font-bold text-rose-400 uppercase tracking-wider">
                Erros
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold text-rose-300 mt-2 font-mono tabular-nums">
                {currentJob.total_errors}
              </span>
            </div>
          </div>

          {/* Status Message */}
          {currentJob.status_message && (
            <div className="text-sm text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
              {currentJob.status === 'completed' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : currentJob.status === 'failed' || currentJob.status === 'partial' ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 mt-2 ml-1" />
              )}
              <span className="leading-relaxed font-medium">{currentJob.status_message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
