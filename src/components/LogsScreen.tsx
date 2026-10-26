import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Search, AlertCircle, AlertTriangle, Info, Bug, ChevronDown, ChevronUp } from 'lucide-react';

type AuditLog = {
  id: string;
  created_at: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  event: string;
  message: string;
  job_id: string;
  metadata: string;
};

const levelLabels: Record<string, string> = { debug: 'Debug', info: 'Info', warn: 'Aviso', error: 'Erro' };
const levelClasses: Record<string, string> = {
  debug: 'bg-zinc-100 text-zinc-600',
  info: 'bg-blue-50 text-blue-700',
  warn: 'bg-amber-50 text-amber-800',
  error: 'bg-red-50 text-red-700',
};

export const LogsScreen: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [jobId, setJobId] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (level) params.set('level', level);
      if (category) params.set('category', category);
      if (query.trim()) params.set('query', query.trim());
      if (jobId.trim()) params.set('jobId', jobId.trim());
      const response = await fetch(`/api/logs?${params.toString()}`);
      if (!response.ok) throw new Error('Não foi possível carregar os logs.');
      const data = await response.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      setError(err?.message || 'Falha ao consultar os logs.');
    } finally {
      setLoading(false);
    }
  }, [level, category, query, jobId]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const downloadLogs = () => {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (category) params.set('category', category);
    if (query.trim()) params.set('query', query.trim());
    if (jobId.trim()) params.set('jobId', jobId.trim());
    window.location.href = `/api/logs/export?${params.toString()}`;
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
  };

  const iconForLevel = (value: string) => {
    if (value === 'error') return <AlertCircle className="w-4 h-4" />;
    if (value === 'warn') return <AlertTriangle className="w-4 h-4" />;
    if (value === 'debug') return <Bug className="w-4 h-4" />;
    return <Info className="w-4 h-4" />;
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Logs e auditoria</h1>
          <p className="mt-1 text-sm text-zinc-500">Eventos persistidos no SQLite para diagnosticar coletas e anexar evidências a uma revisão no GitHub.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadLogs()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={downloadLogs} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            <Download className="w-4 h-4" /> Baixar JSONL
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_180px] gap-3 bg-white border border-zinc-200 rounded-xl p-4 mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar mensagem, evento, ID da pesquisa..." className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-zinc-400 focus:bg-white" />
        </div>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <option value="">Todos os níveis</option>
          <option value="error">Erros</option>
          <option value="warn">Avisos</option>
          <option value="info">Informações</option>
          <option value="debug">Debug</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <option value="">Todas as categorias</option>
          <option value="scraper">Raspagem</option>
          <option value="server">Servidor</option>
          <option value="api">API</option>
        </select>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex-1 text-xs font-medium text-zinc-600">ID da pesquisa (opcional)
          <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="job_..." className="mt-1 block w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-normal outline-none focus:border-zinc-400 focus:bg-white" />
        </label>
        <button onClick={() => { if (jobId.trim()) window.location.href = `/api/reports/${encodeURIComponent(jobId.trim())}`; }} disabled={!jobId.trim()} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40">Baixar relatório JSON da pesquisa</button>
      </div>

      <div className="flex items-center justify-between mb-3 text-xs text-zinc-500">
        <span>{total.toLocaleString('pt-BR')} eventos encontrados</span>
        <span>Exibindo até 100 mais recentes</span>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {loading && logs.length === 0 ? <div className="p-12 text-center text-sm text-zinc-500">Carregando logs...</div>
          : logs.length === 0 ? <div className="p-12 text-center text-sm text-zinc-500">Nenhum evento encontrado para estes filtros.</div>
          : <div className="divide-y divide-zinc-100">
            {logs.map((log) => {
              const isExpanded = expanded === log.id;
              return <div key={log.id} className="px-4 py-4 hover:bg-zinc-50/60">
                <button onClick={() => setExpanded(isExpanded ? null : log.id)} className="flex w-full items-start gap-3 text-left">
                  <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${levelClasses[log.level] || levelClasses.info}`}>
                    {iconForLevel(log.level)} {levelLabels[log.level] || log.level}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-zinc-900">{log.event}</span>
                      <span className="text-[11px] text-zinc-400">{log.category}</span>
                    </span>
                    <span className="mt-1 block text-sm text-zinc-700 break-words">{log.message}</span>
                    <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-400">
                      <span>{formatDate(log.created_at)}</span>
                      {log.job_id && <span className="font-mono">Pesquisa: {log.job_id}</span>}
                    </span>
                  </span>
                  {isExpanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />}
                </button>
                {isExpanded && <div className="mt-3 ml-0 sm:ml-20 rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-400">Metadados técnicos</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words">{(() => { try { return JSON.stringify(JSON.parse(log.metadata || '{}'), null, 2); } catch { return log.metadata || '{}'; } })()}</pre>
                  <div className="mt-3 break-all text-zinc-400">ID do evento: {log.id}</div>
                </div>}
              </div>;
            })}
          </div>}
      </div>
      <p className="mt-4 text-xs text-zinc-400">O download gera um arquivo .jsonl, um evento JSON por linha. Anexe esse arquivo ao relatório ou ao issue do GitHub; ele não inclui o banco de dados inteiro.</p>
    </div>
  );
};
