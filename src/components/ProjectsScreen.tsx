import React, { useEffect, useMemo, useState } from 'react';
import { Folder, FolderOpen, MapPin, Search, ArrowRight, Layers3 } from 'lucide-react';
import { ScrapeJob } from '../shared/types';

// Requisições internas usam a sessão da conta; API keys ficam reservadas a integrações externas.
async function accountFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = window.sessionStorage.getItem('mapscrape_session_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: init.cache || 'no-store' });
}

type PersistedProject = { id: string; name: string; created_at: string; updated_at?: string };
interface Props {
  jobs: ScrapeJob[];
  apiReady: boolean;
  onOpenJob: (jobId: string) => void;
  onNewScrape: () => void;
}

export const ProjectsScreen: React.FC<Props> = ({ jobs, apiReady, onOpenJob, onNewScrape }) => {
  const [query, setQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [catalog, setCatalog] = useState<PersistedProject[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!apiReady) return;
    let active = true;
    accountFetch('/api/projects', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (active) {
          setCatalog(Array.isArray(data.projects) ? data.projects : []);
          setMessage('');
        }
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : 'Falha ao carregar projetos.');
      });
    return () => { active = false; };
  }, [apiReady]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name || !apiReady) return;
    try {
      const response = await accountFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setCatalog((current) => current.some((item) => item.id === data.project.id)
        ? current
        : [...current, data.project].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setNewProjectName('');
      setMessage(`Projeto “${data.project.name}” salvo.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao criar projeto.');
    }
  };

  const projects = useMemo(() => {
    const persisted = catalog.map((project) => {
      const related = jobs.filter((job) => job.project_id === project.id || (!job.project_id && job.project_name === project.name))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { id: project.id, name: project.name, jobs: related, total: related.reduce((sum, job) => sum + (job.total_collected || 0), 0) };
    });
    const knownNames = new Set(persisted.map((project) => project.name.toLocaleLowerCase('pt-BR')));
    const legacy = new Map<string, ScrapeJob[]>();
    for (const job of jobs) {
      const name = job.project_name?.trim() || `${job.segment} · ${job.location}`;
      if (knownNames.has(name.toLocaleLowerCase('pt-BR'))) continue;
      legacy.set(name, [...(legacy.get(name) || []), job]);
    }
    const all = [
      ...persisted,
      ...[...legacy.entries()].map(([name, items]) => ({
        id: `legacy:${name}`, name,
        jobs: items.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        total: items.reduce((sum, job) => sum + (job.total_collected || 0), 0),
      })),
    ];
    const needle = query.toLocaleLowerCase('pt-BR');
    return all.filter((project) => project.name.toLocaleLowerCase('pt-BR').includes(needle)
      || project.jobs.some((job) => `${job.segment} ${job.location}`.toLocaleLowerCase('pt-BR').includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [jobs, catalog, query]);

  return <div className="mx-auto max-w-7xl space-y-6 py-2 sm:py-6">
    <header className="flex flex-col gap-4 border-b border-zinc-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Organização</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">Projetos</h1><p className="mt-3 max-w-2xl text-zinc-400">Crie projetos persistidos e reúna neles suas coletas e resultados.</p></div>
      <button type="button" onClick={onNewScrape} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Nova coleta</button>
    </header>
    <form onSubmit={(event) => void createProject(event)} className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row">
      <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} maxLength={120} placeholder="Nome do novo projeto" aria-label="Nome do novo projeto" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" />
      <button disabled={!apiReady || !newProjectName.trim()} className="rounded-lg border border-emerald-500/40 px-4 py-2.5 text-sm font-semibold text-emerald-300 disabled:opacity-40">Criar projeto</button>
    </form>
    {message && <p role="status" className="text-sm text-zinc-400">{message}</p>}
    <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><input aria-label="Buscar projeto" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar projeto, segmento ou localização" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 outline-none focus:border-emerald-500"/></div>
    {projects.length === 0
      ? <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center"><FolderOpen className="mx-auto h-8 w-8 text-zinc-500"/><h2 className="mt-3 font-semibold text-zinc-200">{query ? 'Nenhum projeto corresponde à busca' : 'Nenhum projeto criado'}</h2><p className="mt-2 text-sm text-zinc-400">{query ? 'Altere o termo de busca.' : 'Crie um projeto aqui ou inicie uma coleta.'}</p></div>
      : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <article key={project.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-start gap-3"><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-400"><Folder className="h-5 w-5"/></div><div className="min-w-0 flex-1"><h2 className="break-words font-semibold text-zinc-100">{project.name}</h2><p className="mt-1 text-xs text-zinc-400">{project.jobs.length} {project.jobs.length === 1 ? 'coleta' : 'coletas'} · {project.total.toLocaleString('pt-BR')} registros coletados</p></div></div>
        {project.jobs.length > 0 && <div className="mt-4 space-y-2 border-t border-zinc-800 pt-3">{project.jobs.map((job) => <div key={job.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/70 px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-200">{job.segment}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-500"><MapPin className="h-3 w-3 shrink-0"/>{job.location}</p><p className="mt-1 text-xs text-zinc-500">{job.status} · {job.total_collected} salvos</p></div><button type="button" onClick={() => onOpenJob(job.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-emerald-500 hover:text-emerald-300">Abrir <ArrowRight className="h-3.5 w-3.5"/></button></div>)}</div>}
      </article>)}</div>}
    <p className="flex items-center gap-2 text-xs text-zinc-500"><Layers3 className="h-4 w-4"/>Projetos novos têm identificador próprio. Coletas antigas continuam visíveis por compatibilidade.</p>
  </div>;
};
