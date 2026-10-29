import { randomUUID } from 'node:crypto';
import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { createJob, listJobs, resolveProject, resolveSearchCategory, updateJobProgress, type ScrapeJob } from '@/src/server/db';
import { runScraperJob } from '@/src/server/scraper/runner';
import { json, getRequest, getBodyJson } from '@/functions/_util';

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;

  try {
    const jobs = await listJobs(scope);
    return json({
      data: jobs.map((j) => ({
        id: j.id, segment: j.segment, project_name: j.project_name, project_id: j.project_id,
        category_id: j.category_id, location: j.location, limit_requested: j.limit_requested,
        status: j.status, status_message: j.status_message, total_found: j.total_found,
        total_collected: j.total_collected, total_duplicates: j.total_duplicates,
        total_errors: j.total_errors, current_step: j.current_step,
        created_at: j.created_at, completed_at: j.completed_at, isRunning: j.status === 'running',
      })),
    });
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
  const jobId = `job_${randomUUID().replace(/-/g, '')}`;

  try {
    const defaultProjectName = `${String(segment).trim()} · ${String(location).trim()}`;
    const project = await resolveProject(scope, projectName ? String(projectName).trim() : defaultProjectName, scope);
    const category = await resolveSearchCategory(scope, categoryName ? String(categoryName).trim() : String(segment).trim(), scope);

    const job = {
      id: jobId, user_id: scope, segment: String(segment).trim(),
      project_name: project.name, project_id: project.id, category_id: category.id,
      location: String(location).trim(), limit_requested: limitNum,
      status: 'running' as const, status_message: 'Coleta iniciada.',
      total_found: 0, total_collected: 0, total_duplicates: 0, total_errors: 0,
      current_step: 'Inicializando coleta...', created_at: now, completed_at: null,
    };

    await createJob(job);

    const browserWsEndpoint = String(context.env?.BROWSER_WS_ENDPOINT ?? '');

    // Se não há endpoint do navegador configurado, marcar job como falhado imediatamente
    if (!browserWsEndpoint) {
      await updateJobProgress(job.id, {
        status: 'failed',
        status_message: 'Navegador remoto não configurado (BROWSER_WS_ENDPOINT ausente).',
        completed_at: new Date().toISOString(),
      }).catch(() => {});
      return json({
        data: {
          jobId: job.id, status: 'failed',
          statusUrl: `/api/v1/jobs/${job.id}`,
          resultsUrl: `/api/v1/jobs/${job.id}/results`,
        },
      }, 202);
    }

    // Despacha a execução real da coleta em background (não bloqueia a resposta HTTP).
    // O job segue como 'running' até que runScraperJob defina um estado terminal.
    void runScraperJob(
      job.id,
      job.segment,
      job.location,
      job.limit_requested,
      async (progress: { status?: ScrapeJob['status']; status_message?: string; total_found?: number; total_collected?: number; total_duplicates?: number; total_errors?: number; current_step?: string }) => {
        try {
          await updateJobProgress(job.id, {
            ...(progress.status !== undefined && { status: progress.status }),
            ...(progress.status_message !== undefined && { status_message: progress.status_message }),
            ...(progress.total_found !== undefined && { total_found: progress.total_found }),
            ...(progress.total_collected !== undefined && { total_collected: progress.total_collected }),
            ...(progress.total_duplicates !== undefined && { total_duplicates: progress.total_duplicates }),
            ...(progress.total_errors !== undefined && { total_errors: progress.total_errors }),
            ...(progress.current_step !== undefined && { current_step: progress.current_step }),
          });
        } catch {
          // Falha ao gravar progresso não deve quebrar a coleta em andamento.
        }
      },
      browserWsEndpoint
    ).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`runScraperJob failed for job ${job.id}:`, errorMessage);
      void updateJobProgress(job.id, {
        status: 'failed',
        status_message: `Falha ao executar coleta: ${errorMessage.slice(0, 200)}`,
        completed_at: new Date().toISOString(),
      }).catch(() => {});
    });

    return json({
      data: {
        jobId: job.id, status: 'running',
        statusUrl: `/api/v1/jobs/${job.id}`,
        resultsUrl: `/api/v1/jobs/${job.id}/results`,
      },
    }, 202);
  } catch (error) {
    console.error('[api/v1/jobs] create failed:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'job_start_failed', message: 'Erro ao iniciar job.' }, 500);
  }
};
