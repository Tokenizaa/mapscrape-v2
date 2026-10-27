import React, { useMemo, useState } from 'react';
import { Folder, FolderOpen, MapPin, Search, ArrowRight, Layers3 } from 'lucide-react';
import { ScrapeJob } from '../shared/types';

interface Props { jobs: ScrapeJob[]; onOpenJob: (jobId: string) => void; }
export const ProjectsScreen: React.FC<Props> = ({ jobs, onOpenJob }) => {
  const [query, setQuery] = useState('');
  const projects = useMemo(() => {
    const grouped = new Map<string, ScrapeJob[]>();
    for (const job of jobs) {
      const name = job.project_name?.trim() || `${job.segment} · ${job.location}`;
      grouped.set(name, [...(grouped.get(name) || []), job]);
    }
    return [...grouped.entries()]
      .map(([name, items]) => ({ name, jobs: items.sort((a,b) => b.created_at.localeCompare(a.created_at)), total: items.reduce((sum, job) => sum + (job.total_collected || 0), 0) }))
      .filter((project) => project.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) || project.jobs.some((job) => `${job.segment} ${job.location}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))))
      .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [jobs, query]);
  return <div className="mx-auto max-w-7xl space-y-6 py-2 sm:py-6">
    <header className="border-b border-zinc-800 pb-5"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Organização</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">Projetos</h1><p className="mt-3 max-w-2xl text-zinc-400">Pastas persistidas junto às coletas. Cada projeto reúne suas execuções e mantém os resultados associados no banco.</p></header>
    <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><input aria-label="Buscar projeto" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar projeto, segmento ou localização" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 outline-none focus:border-emerald-500"/></div>
    {projects.length===0 ? <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center"><FolderOpen className="mx-auto h-8 w-8 text-zinc-500"/><h2 className="mt-3 font-semibold text-zinc-200">{jobs.length===0?'Nenhum projeto criado':'Nenhum projeto corresponde à busca'}</h2><p className="mt-2 text-sm text-zinc-400">{jobs.length===0?'Inicie uma coleta e informe o nome da pasta na tela Pesquisar.':'Altere o termo de busca para localizar outra pasta.'}</p></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{projects.map(project=><article key={project.name} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"><div className="flex items-start gap-3"><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-400"><Folder className="h-5 w-5"/></div><div className="min-w-0 flex-1"><h2 className="break-words font-semibold text-zinc-100">{project.name}</h2><p className="mt-1 text-xs text-zinc-400">{project.jobs.length} {project.jobs.length===1?'coleta':'coletas'} · {project.total.toLocaleString('pt-BR')} registros coletados</p></div></div><div className="mt-4 space-y-2 border-t border-zinc-800 pt-3">{project.jobs.map(job=><div key={job.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/70 px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-200">{job.segment}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-500"><MapPin className="h-3 w-3 shrink-0"/>{job.location}</p><p className="mt-1 text-xs text-zinc-500">{job.status} · {job.total_collected} salvos</p></div><button type="button" onClick={()=>onOpenJob(job.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-emerald-500 hover:text-emerald-300">Abrir <ArrowRight className="h-3.5 w-3.5"/></button></div>)}</div></article>)}</div>}
    <p className="flex items-center gap-2 text-xs text-zinc-500"><Layers3 className="h-4 w-4"/>Pastas agrupadas a partir do campo de projeto salvo em cada coleta. Coletas antigas sem nome próprio usam segmento e localização como nome de pasta.</p>
  </div>;
};
