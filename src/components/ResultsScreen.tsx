import React, { useState, useMemo } from 'react';
import {
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
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

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  places,
  totalPlaces,
  jobs,
  selectedJobId,
  onSelectJobId,
  selectedPlaceIds,
  onToggleSelectPlace,
  onToggleSelectAll,
  onGoToExport,
  searchQuery,
  onSearchQueryChange,
  sortBy,
  sortOrder,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading,
}) => {
  const allCurrentIds = useMemo(() => places.map((p) => p.id), [places]);
  const isAllCurrentSelected =
    allCurrentIds.length > 0 && allCurrentIds.every((id) => selectedPlaceIds.has(id));

  const totalPages = Math.max(1, Math.ceil(totalPlaces / pageSize));

  const renderSortIndicator = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 inline ml-1" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 inline ml-1" />
    );
  };

  const renderMissingBadge = (val: string | null | undefined, placeholder: string = 'Não informado') => {
    if (!val || !val.trim()) {
      return (
        <span className="text-zinc-400 text-xs italic">
          {placeholder}
        </span>
      );
    }
    return <span className="text-zinc-800 text-xs">{val}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
            Registros Coletados
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {totalPlaces} estabelecimentos salvos no SQLite a partir das fichas públicas do Google Maps.
          </p>
        </div>

        {/* Action: Export Selected */}
        <div className="flex items-center gap-3">
          {selectedPlaceIds.size > 0 && (
            <button
              onClick={onGoToExport}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>Exportar {selectedPlaceIds.size} selecionados</span>
            </button>
          )}
        </div>
      </div>

      {/* Control Bar: Filter by Job, Text Search, Page Size */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-6 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Text Search */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
              onPageChange(1);
            }}
            placeholder="Pesquisar por nome, categoria, endereço, telefone ou site..."
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all"
          />
        </div>

        {/* Filter by Search Job */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-500 shrink-0" />
          <select
            value={selectedJobId || ''}
            onChange={(e) => {
              onSelectJobId(e.target.value || undefined);
              onPageChange(1);
            }}
            className="py-2 pl-3 pr-8 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">Todas as pesquisas ({jobs.length})</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.segment} em {job.location} ({job.total_collected} itens)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-zinc-200 rounded-xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            Carregando registros...
          </div>
        ) : places.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <p className="text-zinc-900 font-medium text-base">Nenhum registro encontrado</p>
            <p className="text-zinc-500 text-xs mt-1">
              Inicie uma pesquisa na aba "Pesquisar" para coletar estabelecimentos reais.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/75 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllCurrentSelected}
                      onChange={() => onToggleSelectAll(allCurrentIds)}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                    />
                  </th>
                  <th
                    onClick={() => onSortChange('name')}
                    className="py-3 px-4 cursor-pointer hover:text-zinc-900"
                  >
                    Estabelecimento {renderSortIndicator('name')}
                  </th>
                  <th
                    onClick={() => onSortChange('category')}
                    className="py-3 px-4 cursor-pointer hover:text-zinc-900"
                  >
                    Categoria {renderSortIndicator('category')}
                  </th>
                  <th
                    onClick={() => onSortChange('rating')}
                    className="py-3 px-4 cursor-pointer hover:text-zinc-900 text-center"
                  >
                    Nota / Avaliações {renderSortIndicator('rating')}
                  </th>
                  <th className="py-3 px-4">Endereço</th>
                  <th className="py-3 px-4">Telefone</th>
                  <th className="py-3 px-4">Site</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Ficha Maps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs text-zinc-700">
                {places.map((place) => {
                  const isSelected = selectedPlaceIds.has(place.id);
                  return (
                    <tr
                      key={place.id}
                      className={`hover:bg-zinc-50/80 transition-colors ${
                        isSelected ? 'bg-zinc-50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelectPlace(place.id)}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                        />
                      </td>

                      {/* Nome */}
                      <td className="py-3.5 px-4 font-medium text-zinc-900 max-w-[200px] truncate">
                        {place.name || <span className="text-zinc-400 italic">Sem nome</span>}
                      </td>

                      {/* Categoria */}
                      <td className="py-3.5 px-4 max-w-[150px] truncate">
                        {renderMissingBadge(place.category)}
                      </td>

                      {/* Nota e Avaliações */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {place.rating ? (
                          <div className="inline-flex items-center gap-1 font-medium text-zinc-800">
                            <span className="text-amber-500 font-bold">★</span>
                            <span>{place.rating}</span>
                            {place.review_count && (
                              <span className="text-zinc-400 text-[11px] font-normal">
                                ({place.review_count})
                              </span>
                            )}
                          </div>
                        ) : (
                          renderMissingBadge(null, 'Sem nota')
                        )}
                      </td>

                      {/* Endereço */}
                      <td className="py-3.5 px-4 max-w-[220px] truncate" title={place.address}>
                        {renderMissingBadge(place.address)}
                      </td>

                      {/* Telefone */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderMissingBadge(place.phone)}
                      </td>

                      {/* Site */}
                      <td className="py-3.5 px-4 max-w-[160px] truncate">
                        {place.website ? (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline truncate block"
                            title={place.website}
                          >
                            {place.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        ) : (
                          renderMissingBadge(null)
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderMissingBadge(place.business_status)}
                      </td>

                      {/* Link Maps */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {place.maps_url ? (
                          <a
                            href={place.maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900 font-medium px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 transition-colors"
                            title="Abrir ficha original no Google Maps"
                          >
                            <span>Ficha</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPlaces > 0 && (
          <div className="border-t border-zinc-200 py-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600 bg-zinc-50/50">
            <div className="flex items-center gap-2">
              <span>Linhas por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  onPageSizeChange(Number(e.target.value));
                  onPageChange(1);
                }}
                className="py-1 px-2 border border-zinc-200 rounded bg-white text-xs text-zinc-800"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-zinc-400 ml-2">
                Mostrando {Math.min((currentPage - 1) * pageSize + 1, totalPlaces)} -{' '}
                {Math.min(currentPage * pageSize, totalPlaces)} de {totalPlaces}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                className="p-1.5 rounded border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono">
                Página {currentPage} de {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                className="p-1.5 rounded border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
