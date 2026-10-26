import React from 'react';
import { Table2, FileDown, Trash2, Calendar, MapPin, Building2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { ScrapeJob } from '../shared/types';

interface HistoryScreenProps {
  jobs: ScrapeJob[];
  onViewResults: (jobId: string) => void;
  onGoToExportWithJob: (jobId: string) => void;
  onDeleteJob: (jobId: string) => Promise<void>;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  jobs,
  onViewResults,
  onGoToExportWithJob,
  onDeleteJob,
}) => {
  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(d);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 tracking-tight">
          Histórico de Pesquisas
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-600">
          Registro de todas as pesquisas realizadas no Google Maps, com status de coleta e acesso direto aos estabelecimentos salvos no SQLite.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center shadow-xs">
          <Clock className="w-8 h-8 text-zinc-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-zinc-900">Nenhuma pesquisa no histórico</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Quando você iniciar uma coleta na Tela 1, ela será registrada aqui com seus contadores e dados persistidos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            return (
              <div
                key={job.id}
                className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 shadow-xs hover:border-zinc-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Left: Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-900 text-base">
                        {job.segment}
                      </span>
                      <span className="text-zinc-400">·</span>
                      <span className="text-zinc-600 text-sm flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                        {job.location}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                        {formatDate(job.created_at)}
                      </span>
                      <span>
                        Solicitado: <strong className="text-zinc-700">{job.limit_requested}</strong>
                      </span>
                      <span>
                        Coletados:{' '}
                        <strong className="text-emerald-700 font-medium">
                          {job.total_collected}
                        </strong>
                      </span>
                      {job.total_duplicates > 0 && (
                        <span>
                          Duplicados: <strong className="text-zinc-600">{job.total_duplicates}</strong>
                        </span>
                      )}
                      {job.total_errors > 0 && (
                        <span className="text-red-600">
                          Erros: <strong>{job.total_errors}</strong>
                        </span>
                      )}
                    </div>

                    {job.status_message && (
                      <p className="text-xs text-zinc-500 mt-1 italic line-clamp-1">
                        {job.status_message}
                      </p>
                    )}
                  </div>

                  {/* Right: Status badge & Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        job.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : job.status === 'running'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : job.status === 'partial'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : job.status === 'stopped'
                          ? 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {job.status === 'completed' && 'Concluída'}
                      {job.status === 'running' && 'Em andamento'}
                      {job.status === 'partial' && 'Parcial'}
                      {job.status === 'stopped' && 'Interrompida'}
                      {job.status === 'failed' && 'Falha'}
                    </span>

                    {/* View in Table */}
                    <button
                      onClick={() => onViewResults(job.id)}
                      className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Ver registros coletados na tabela"
                    >
                      <Table2 className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Ver Resultados</span>
                    </button>

                    {/* Direct CSV Export */}
                    <button
                      onClick={() => onGoToExportWithJob(job.id)}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Exportar esta pesquisa para CSV"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Exportar CSV</span>
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => {
                        if (confirm(`Deseja remover esta pesquisa (${job.segment}) e seus registros?`)) {
                          onDeleteJob(job.id);
                        }
                      }}
                      className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir pesquisa do banco"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
