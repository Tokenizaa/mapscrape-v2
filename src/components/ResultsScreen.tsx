import React, { useMemo, useState } from 'react';
import { Search, ExternalLink, FileDown, ChevronLeft, ChevronRight, Filter, MapPin, Phone, Globe, Star, Clock3, X, Building2, CalendarClock, Copy, Check } from 'lucide-react';
import { PlaceRecord, ScrapeJob } from '../shared/types';

interface ResultsScreenProps {
  places: PlaceRecord[];
  totalPlaces: number;
  jobs: ScrapeJob[];
  selectedJobId: string | undefined;
  onSelectJobId: (id: string | undefined) => void;
  selectedPlaceIds: Set<string>;
  onToggleSelectPlace: (id: string) => void;
  onToggleSelectAll: (allIds: string[]) => void;
  onGoToExport: () => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isLoading: boolean;
}

const fields: { key: keyof PlaceRecord; label: string }[] = [
  { key: 'category', label: 'Categoria' },
  { key: 'address', label: 'Endereço' },
  { key: 'phone', label: 'Telefone' },
  { key: 'website', label: 'Site' },
  { key: 'business_status', label: 'Status' },
  { key: 'opening_hours', label: 'Horários' },
  { key: 'price_range', label: 'Faixa de preço' },
  { key: 'description', label: 'Descrição' },
  { key: 'services_attributes', label: 'Serviços e atributos' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'collected_at', label: 'Data da coleta' },
];

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  places, totalPlaces, jobs, selectedJobId, onSelectJobId, selectedPlaceIds,
  onToggleSelectPlace, onToggleSelectAll, onGoToExport, searchQuery,
  onSearchQueryChange, sortBy, sortOrder, onSortChange, currentPage, pageSize,
  onPageChange, onPageSizeChange, isLoading,
}) => {
  const [selectedPlace, setSelectedPlace] = useState<PlaceRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const currentIds = useMemo(() => places.map((place) => place.id), [places]);
  const isAllSelected = currentIds.length > 0 && currentIds.every((id) => selectedPlaceIds.has(id));
  const totalPages = Math.max(1, Math.ceil(totalPlaces / pageSize));

  const copyDetails = async () => {
    if (!selectedPlace) return;
    const content = [
      selectedPlace.name,
      ...fields.map(({ key, label }) => `${label}: ${String(selectedPlace[key] || 'Não informado')}`),
      `Nota: ${selectedPlace.rating || 'Não informada'}`,
      `Avaliações: ${selectedPlace.review_count || 'Não informado'}`,
      `Ficha Maps: ${selectedPlace.maps_url || 'Não informada'}`,
    ].join('\\n');
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const missing = (value: string | null | undefined) => value?.trim() || 'Não informado';

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Leads coletados</h1>
          <p className="mt-1 text-sm text-zinc-500">{totalPlaces.toLocaleString('pt-BR')} estabelecimentos salvos. Abra um card para conferir todos os campos antes de exportar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {places.length > 0 && <button onClick={() => onToggleSelectAll(currentIds)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">{isAllSelected ? 'Desmarcar página' : 'Selecionar página'}</button>}
          {selectedPlaceIds.size > 0 && <button onClick={onGoToExport} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"><FileDown className="h-4 w-4" /> Exportar {selectedPlaceIds.size} selecionados</button>}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input value={searchQuery} onChange={(e) => { onSearchQueryChange(e.target.value); onPageChange(1); }} placeholder="Buscar por nome, categoria, endereço, telefone ou site..." className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-zinc-400 focus:bg-white" />
        </div>
        <label className="flex items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-zinc-500" />
          <select value={selectedJobId || ''} onChange={(e) => { onSelectJobId(e.target.value || undefined); onPageChange(1); }} className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
            <option value="">Todas as pesquisas ({jobs.length})</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.segment} · {job.location} ({job.total_collected})</option>)}
          </select>
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">Ordenar por:
          {' '}<button onClick={() => onSortChange('name')} className={`ml-1 underline underline-offset-2 ${sortBy === 'name' ? 'font-semibold text-zinc-900' : 'text-zinc-500'}`}>Nome {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button>
          {' '}<button onClick={() => onSortChange('rating')} className={`ml-3 underline underline-offset-2 ${sortBy === 'rating' ? 'font-semibold text-zinc-900' : 'text-zinc-500'}`}>Nota {sortBy === 'rating' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button>
          {' '}<button onClick={() => onSortChange('review_count')} className={`ml-3 underline underline-offset-2 ${sortBy === 'review_count' ? 'font-semibold text-zinc-900' : 'text-zinc-500'}`}>Avaliações {sortBy === 'review_count' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button>
        </p>
        <label className="flex items-center gap-2 text-xs text-zinc-500">Por página
          <select value={pageSize} onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }} className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700">
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      {isLoading ? <div className="rounded-xl border border-zinc-200 bg-white py-16 text-center text-sm text-zinc-500">Carregando estabelecimentos...</div>
        : places.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center"><Building2 className="mx-auto mb-3 h-8 w-8 text-zinc-300" /><h2 className="font-semibold text-zinc-900">Nenhum lead encontrado</h2><p className="mt-1 text-sm text-zinc-500">Ajuste os filtros ou inicie uma nova coleta.</p></div>
        : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {places.map((place) => {
            const selected = selectedPlaceIds.has(place.id);
            return <article key={place.id} className={`flex min-w-0 flex-col rounded-xl border bg-white p-4 transition-colors hover:border-zinc-400 ${selected ? 'border-zinc-900 ring-1 ring-zinc-900/10' : 'border-zinc-200'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`Selecionar ${place.name}`} checked={selected} onChange={() => onToggleSelectPlace(place.id)} className="mt-1 h-4 w-4 rounded border-zinc-300 accent-zinc-900" />
                <button onClick={() => setSelectedPlace(place)} className="min-w-0 flex-1 text-left">
                  <h2 className="line-clamp-2 text-base font-semibold leading-5 text-zinc-900 hover:underline">{missing(place.name)}</h2>
                  <p className="mt-1 truncate text-xs text-zinc-500">{missing(place.category)}</p>
                </button>
                {place.maps_url && <a href={place.maps_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Abrir ficha do Google Maps" title="Abrir ficha do Google Maps" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"><ExternalLink className="h-4 w-4" /></a>}
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Star className={`h-4 w-4 ${place.rating ? 'fill-amber-400 text-amber-500' : 'text-zinc-300'}`} />
                <span className="font-semibold text-zinc-900">{place.rating || '—'}</span>
                <span className="text-xs text-zinc-500">{place.review_count ? `(${place.review_count} avaliações)` : 'Sem avaliações'}</span>
              </div>
              <div className="mt-3 space-y-2 text-xs text-zinc-600">
                <p className="flex gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" /><span className="line-clamp-2">{missing(place.address)}</span></p>
                <p className="flex gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" /><span>{missing(place.phone)}</span></p>
                <p className="flex gap-2"><Globe className="h-3.5 w-3.5 shrink-0 text-zinc-400" /><span className="truncate">{place.website ? place.website.replace(/^https?:\/\/(www\.)?/, '') : 'Site não informado'}</span></p>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
                <span className={`max-w-[65%] truncate rounded-full px-2.5 py-1 text-[11px] font-medium ${/aberto/i.test(place.business_status) ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{missing(place.business_status)}</span>
                <button onClick={() => setSelectedPlace(place)} className="shrink-0 text-xs font-semibold text-zinc-900 hover:underline">Ver detalhes</button>
              </div>
            </article>;
          })}
        </div>}

      {totalPlaces > 0 && <div className="mt-5 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <span>Mostrando {Math.min((currentPage - 1) * pageSize + 1, totalPlaces)}–{Math.min(currentPage * pageSize, totalPlaces)} de {totalPlaces}</span>
        <div className="flex items-center justify-end gap-3">
          <button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-3 py-2 text-zinc-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</button>
          <span>Página {currentPage} de {totalPages}</span>
          <button disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-3 py-2 text-zinc-700 disabled:opacity-40">Próxima <ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>}

      {selectedPlace && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedPlace(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="lead-detail-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Detalhes do estabelecimento</p>
              <h2 id="lead-detail-title" className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">{missing(selectedPlace.name)}</h2>
              <p className="mt-1 text-sm text-zinc-500">{missing(selectedPlace.category)}</p>
            </div>
            <button onClick={() => setSelectedPlace(null)} aria-label="Fechar detalhes" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-5 w-5" /></button>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Nota no Maps</p><p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-zinc-900"><Star className="h-4 w-4 fill-amber-400 text-amber-500" />{selectedPlace.rating || '—'}<span className="text-xs font-normal text-zinc-500">{selectedPlace.review_count ? `· ${selectedPlace.review_count} avaliações` : ''}</span></p></div>
              <div className="rounded-lg bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Status informado</p><p className="mt-2 text-sm font-semibold text-zinc-900">{missing(selectedPlace.business_status)}</p></div>
            </div>
            <div className="divide-y divide-zinc-100">
              {fields.map(({ key, label }) => {
                const value = String(selectedPlace[key] ?? '').trim();
                return <div key={key} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[155px_1fr] sm:gap-4">
                  <dt className="text-xs font-medium text-zinc-500">{label}</dt>
                  <dd className={`min-w-0 break-words text-sm ${value ? 'text-zinc-900' : 'italic text-zinc-400'}`}>
                    {value ? key === 'website' ? <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">{value}<ExternalLink className="h-3 w-3 shrink-0" /></a> : value : 'Não informado na ficha'}
                  </dd>
                </div>;
              })}
              <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[155px_1fr] sm:gap-4"><dt className="text-xs font-medium text-zinc-500">Ficha original</dt><dd>{selectedPlace.maps_url ? <a href={selectedPlace.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 break-all text-sm font-medium text-blue-700 hover:underline">Abrir no Google Maps <ExternalLink className="h-3.5 w-3.5 shrink-0" /></a> : <span className="text-sm italic text-zinc-400">Link não informado</span>}</dd></div>
              <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[155px_1fr] sm:gap-4"><dt className="text-xs font-medium text-zinc-500">Identificador</dt><dd className="break-all font-mono text-xs text-zinc-500">{selectedPlace.id}</dd></div>
            </div>
          </div>
          <div className="sticky bottom-0 flex flex-wrap justify-between gap-2 border-t border-zinc-200 bg-white px-5 py-4 sm:px-6">
            <button onClick={() => void copyDetails()} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiado' : 'Copiar dados'}</button>
            <div className="flex gap-2">
              <button onClick={() => { onToggleSelectPlace(selectedPlace.id); }} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">{selectedPlaceIds.has(selectedPlace.id) ? 'Desmarcar lead' : 'Selecionar lead'}</button>
              <button onClick={() => setSelectedPlace(null)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Fechar</button>
            </div>
          </div>
        </section>
      </div>}
    </div>
  );
};
