import React, { useState, useMemo } from 'react';
import {
  FileDown,
  CheckSquare,
  Square,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';
import { PlaceRecord, EXPORTABLE_FIELDS, ScrapeJob } from '../shared/types';

interface ExportScreenProps {
  places: PlaceRecord[];
  totalPlaces: number;
  selectedPlaceIds: Set<string>;
  jobs: ScrapeJob[];
  selectedJobId: string | undefined;
  onSelectJobId: (id: string | undefined) => void;
}

export const ExportScreen: React.FC<ExportScreenProps> = ({
  places,
  totalPlaces,
  selectedPlaceIds,
  jobs,
  selectedJobId,
  onSelectJobId,
}) => {
  // Field selection state (default all selected)
  const [selectedFields, setSelectedFields] = useState<Set<keyof PlaceRecord>>(
    new Set(EXPORTABLE_FIELDS.map((f) => f.key))
  );

  // Scope: 'selected' | 'current_job' | 'all'
  const [scope, setScope] = useState<'selected' | 'current_job' | 'all'>(
    selectedPlaceIds.size > 0 ? 'selected' : selectedJobId ? 'current_job' : 'all'
  );

  // Suggested filename
  const defaultFilename = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const currentJob = jobs.find((j) => j.id === selectedJobId);
    if (currentJob) {
      const seg = currentJob.segment.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const loc = currentJob.location.toLowerCase().replace(/[^a-z0-9]/g, '_');
      return `mapscrape_${seg}_${loc}_${today}`;
    }
    return `mapscrape_estabelecimentos_${today}`;
  }, [jobs, selectedJobId]);

  const [filename, setFilename] = useState(defaultFilename);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const toggleField = (key: keyof PlaceRecord) => {
    const next = new Set(selectedFields);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedFields(next);
  };

  const selectAllFields = () => {
    setSelectedFields(new Set(EXPORTABLE_FIELDS.map((f) => f.key)));
  };

  const deselectAllFields = () => {
    // Keep at least name
    setSelectedFields(new Set(['name']));
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const payload: any = {
        fields: Array.from(selectedFields),
        filename: filename.trim() || defaultFilename,
      };

      if (scope === 'selected' && selectedPlaceIds.size > 0) {
        payload.placeIds = Array.from(selectedPlaceIds);
      } else if (scope === 'current_job' && selectedJobId) {
        payload.jobId = selectedJobId;
      }

      const response = await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar arquivo CSV.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${filename.trim() || defaultFilename}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (err: any) {
      alert(`Erro ao exportar CSV: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Preview records (first 3 places)
  const previewRecords = places.slice(0, 3);

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 tracking-tight">
          Exportar para CSV
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-600">
          Gere uma planilha compatível com Microsoft Excel e LibreOffice Calc com codificação UTF-8 BOM, preservação total de acentuação e sanitização contra injeção de fórmulas.
        </p>
      </div>

      <div className="space-y-6">
        {/* Step 1: Escopo dos registros */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
          <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider mb-4">
            1. Escopo dos Registros
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Option A: Selected */}
            <label
              className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${
                scope === 'selected'
                  ? 'border-zinc-900 bg-zinc-50/70 ring-1 ring-zinc-900'
                  : selectedPlaceIds.size === 0
                  ? 'border-zinc-200 opacity-50 cursor-not-allowed'
                  : 'border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="selected"
                checked={scope === 'selected'}
                disabled={selectedPlaceIds.size === 0}
                onChange={() => setScope('selected')}
                className="mt-0.5 text-zinc-900 focus:ring-zinc-900"
              />
              <div>
                <span className="block text-sm font-medium text-zinc-900">
                  Registros selecionados
                </span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  {selectedPlaceIds.size} itens marcados na tabela
                </span>
              </div>
            </label>

            {/* Option B: Current Search */}
            <label
              className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${
                scope === 'current_job'
                  ? 'border-zinc-900 bg-zinc-50/70 ring-1 ring-zinc-900'
                  : !selectedJobId
                  ? 'border-zinc-200 opacity-50 cursor-not-allowed'
                  : 'border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="current_job"
                checked={scope === 'current_job'}
                disabled={!selectedJobId}
                onChange={() => setScope('current_job')}
                className="mt-0.5 text-zinc-900 focus:ring-zinc-900"
              />
              <div>
                <span className="block text-sm font-medium text-zinc-900">
                  Pesquisa filtrada
                </span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  {selectedJobId
                    ? `${jobs.find((j) => j.id === selectedJobId)?.segment || 'Selecionada'}`
                    : 'Nenhuma pesquisa filtrada'}
                </span>
              </div>
            </label>

            {/* Option C: All in database */}
            <label
              className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${
                scope === 'all'
                  ? 'border-zinc-900 bg-zinc-50/70 ring-1 ring-zinc-900'
                  : 'border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="mt-0.5 text-zinc-900 focus:ring-zinc-900"
              />
              <div>
                <span className="block text-sm font-medium text-zinc-900">
                  Todos os registros
                </span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  {totalPlaces} estabelecimentos no SQLite
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Step 2: Seleção dos 15 Campos */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">
                2. Campos a Incluir na Planilha
              </h2>
              <span className="text-xs text-zinc-500">
                {selectedFields.size} de {EXPORTABLE_FIELDS.length} campos selecionados
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllFields}
                className="text-xs font-medium text-zinc-700 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:bg-zinc-50 transition-colors"
              >
                Selecionar todos
              </button>
              <button
                type="button"
                onClick={deselectAllFields}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-700 px-2.5 py-1 rounded border border-zinc-200 hover:bg-zinc-50 transition-colors"
              >
                Limpar seleção
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {EXPORTABLE_FIELDS.map((field) => {
              const isChecked = selectedFields.has(field.key);
              return (
                <label
                  key={field.key}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-zinc-50 border-zinc-300 text-zinc-900'
                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleField(field.key)}
                    className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                  />
                  <div className="leading-tight">
                    <span className="font-medium block">{field.label}</span>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                      {field.description}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Step 3: Nome do Arquivo & Botão Principal */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs space-y-6">
          <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">
            3. Configuração do Arquivo e Download
          </h2>

          <div>
            <label htmlFor="csv_filename" className="block text-xs font-medium text-zinc-700 mb-1.5">
              Nome do arquivo (.csv)
            </label>
            <div className="flex items-center">
              <input
                id="csv_filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="flex-1 py-2.5 px-3 bg-zinc-50 border border-zinc-200 rounded-l-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white"
              />
              <span className="bg-zinc-100 border border-l-0 border-zinc-200 py-2.5 px-3 rounded-r-lg text-sm text-zinc-500 font-mono">
                .csv
              </span>
            </div>
          </div>

          {/* Standards & Security Notice */}
          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg flex items-start gap-3 text-xs text-zinc-600">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-zinc-900">
                Padrões de exportação e segurança garantidos:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-zinc-600">
                <li>Codificação <strong>UTF-8 com BOM (\uFEFF)</strong> para visualização sem erros no Excel e LibreOffice.</li>
                <li><strong>Proteção contra injeção de fórmulas CSV</strong>: células iniciadas com <code className="font-mono bg-zinc-200 px-1 rounded">=</code>, <code className="font-mono bg-zinc-200 px-1 rounded">+</code>, <code className="font-mono bg-zinc-200 px-1 rounded">-</code> ou <code className="font-mono bg-zinc-200 px-1 rounded">@</code> são devidamente sanitizadas.</li>
                <li>Tratamento automático de aspas, quebras de linha e vírgulas.</li>
              </ul>
            </div>
          </div>

          {/* Big Action Button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || totalPlaces === 0}
            className="w-full py-4 px-6 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-medium text-base rounded-xl shadow-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileDown className="w-5 h-5" />
            <span>
              {isExporting
                ? 'Gerando arquivo CSV seguro...'
                : 'Exportar CSV'}
            </span>
          </button>

          {exportSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Arquivo CSV baixado com sucesso!</span>
            </div>
          )}
        </div>

        {/* Prévia dos Dados */}
        {previewRecords.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <FileSpreadsheet className="w-4 h-4 text-zinc-500" />
              <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                Prévia das Primeiras Linhas da Planilha
              </h3>
            </div>
            <div className="overflow-x-auto border border-zinc-100 rounded-lg">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-zinc-50 border-b border-zinc-200 font-semibold text-zinc-600">
                  <tr>
                    {EXPORTABLE_FIELDS.filter((f) => selectedFields.has(f.key))
                      .slice(0, 5)
                      .map((f) => (
                        <th key={f.key} className="p-2 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    {selectedFields.size > 5 && (
                      <th className="p-2 text-zinc-400 font-normal">
                        +{selectedFields.size - 5} colunas...
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {previewRecords.map((r, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50">
                      {EXPORTABLE_FIELDS.filter((f) => selectedFields.has(f.key))
                        .slice(0, 5)
                        .map((f) => (
                          <td key={f.key} className="p-2 whitespace-nowrap max-w-[150px] truncate">
                            {r[f.key] || <span className="text-zinc-300">—</span>}
                          </td>
                        ))}
                      {selectedFields.size > 5 && (
                        <td className="p-2 text-zinc-400">...</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
