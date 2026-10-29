import { randomUUID } from 'node:crypto';
import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { createJob, listJobs, resolveProject, resolveSearchCategory, updateJobProgress, type ScrapeJob } from '@/src/server/db';
import { json, getRequest, getBodyJson } from '@/functions/_util';

interface ScrapeQueueBinding { send(body: { jobId: string }): Promise<void>; }

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;
  try {
    const jobs = await listJobs(scope);
    return json({ data: jobs.map((j) => ({
      id: j.id, segment: j.segment, project_name: j.project_name, project_id: j.project_id,
      category_id: j.category_id, location: j.location, limit_requested: j.limit_requested,
      status: j.status, status_message: j.status_message, total_found: j.total_found,
      total_collected: j.total_collected, total_duplicates: j.total_duplicates,
      total_errors: j.total_errors, current_step: j.current_step,
      created_at: j.created_at, completed_at: j.completed_at, isRunning: j.status === 'running',
    })) });
  } catch (error) {
    console.error('[api/v1/jobs] list failed:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'job_query_failed', message: 'Erro ao listar jobs.' }, 500);
  }
};

export const onRequestPost = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;
  const body = await getBodyJson(req);
  const segment = body?.segment;
  const location = body?.location;
  const limit = body?.limit ?? 20;
  const projectName = body?.projectName;
  const categoryName = body?.categoryName;

  if (!segment || !String(segment).trim()) return json({ error: 'invalid_request', message: 'Segmento é obrigatório.' }, 422);
  if (!location || !String(location).trim()) return json({ error: 'invalid_request', message: 'Localização é obrigatória.' }, 422);
  const limitNum = Number.isFinite(Number(limit)) ? Number(limit) : 20;
  if (limitNum < 1 || limitNum > 100) return json({ error: 'invalid_limit', message: 'Limite deve ser entre 1 e 100.' }, 422);

  const now = new Date().toISOString();
  const jobId = 'job_' + randomUUID().replace(/-/g, '');
  try {
    const defaultProjectName = String(segment).trim() + ' · ' + String(location).trim();
    const project = await resolveProject(scope, projectName ? String(projectName).trim() : defaultProjectName, scope);
    const category = await resolveSearchCategory(scope, categoryName ? String(categoryName).trim() : String(segment).trim(), scope);
    const job = {
      id: jobId, user_id: scope, segment: String(segment).trim(),
      project_name: project.name, project_id: project.id, category_id: category.id,
      location: String(location).trim(), limit_requested: limitNum,
      status: 'running' as const, status_message: 'Coleta enfileirada.',
      total_found: 0, total_collected: 0, total_duplicates: 0, total_errors: 0,
      current_step: 'Aguardando consumidor da fila...', created_at: now, completed_at: null,
    };
    await createJob(job);

    const queue = context.env?.SCRAPE_QUEUE as ScrapeQueueBinding | undefined;
    if (!queue || typeof queue.send !== 'function') {
      await updateJobProgress(job.id, { status: 'failed', status_message: 'Fila de scraping não configurada no Cloudflare Pages.', current_step: 'Falha de configuração', completed_at: new Date().toISOString() }).catch(() => {});
      return json({ error: 'scrape_queue_unavailable', message: 'A fila de processamento não está configurada.' }, 503);
    }

    try {
      // Only the opaque job ID crosses the queue boundary. Secrets and browser
      // connection details remain in server-side Cloudflare bindings.
      await queue.send({ jobId: job.id });
    } catch (queueError) {
      const detail = queueError instanceof Error ? queueError.message : String(queueError);
      console.error('[api/v1/jobs] queue publish failed:', detail);
      await updateJobProgress(job.id, { status: 'failed', status_message: 'Não foi possível enviar a coleta para processamento.', current_step: 'Falha ao enfileirar', completed_at: new Date().toISOString() }).catch(() => {});
      return json({ error: 'scrape_queue_publish_failed', message: 'Não foi possível iniciar o processamento.' }, 503);
    }

    return json({ data: { jobId: job.id, status: 'running', statusUrl: '/api/v1/jobs/' + job.id, resultsUrl: '/api/v1/jobs/' + job.id + '/results' } }, 202);
  } catch (error) {
    console.error('[api/v1/jobs] create failed:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'job_start_failed', message: 'Erro ao iniciar job.' }, 500);
  }
};