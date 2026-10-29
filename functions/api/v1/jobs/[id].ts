import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { getJob, deleteJob } from '@/src/server/db';
import { json, getRequest, getParams } from '@/functions/_util';

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;
  const params = getParams(context);
  const id = params.id;
  if (!id) return json({ error: 'job_not_found', message: 'Coleta não encontrada.' }, 404);

  try {
    const job = await getJob(id, scope);
    if (!job) return json({ error: 'job_not_found', message: 'Coleta inexistente ou fora do escopo.' }, 404);
    return json({
      data: {
        id: job.id, segment: job.segment, project_name: job.project_name, project_id: job.project_id,
        category_id: job.category_id, location: job.location, limit_requested: job.limit_requested,
        status: job.status, status_message: job.status_message, total_found: job.total_found,
        total_collected: job.total_collected, total_duplicates: job.total_duplicates,
        total_errors: job.total_errors, current_step: job.current_step,
        created_at: job.created_at, completed_at: job.completed_at, isRunning: job.status === 'running',
      },
    });
  } catch {
    return json({ error: 'job_query_failed', message: 'Erro ao consultar job.' }, 500);
  }
};

export const onRequestDelete = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;
  const params = getParams(context);
  const id = params.id;
  if (!id) return json({ error: 'job_not_found', message: 'Coleta não encontrada.' }, 404);

  try {
    const job = await getJob(id, scope);
    if (!job) return json({ error: 'job_not_found', message: 'Coleta inexistente ou fora do escopo.' }, 404);
    const deleted = await deleteJob(id, scope);
    if (!deleted) return json({ error: 'invalid_request', message: 'Erro ao excluir job.' }, 500);
    return json({ data: { id, status: 'deleted' } });
  } catch {
    return json({ error: 'job_query_failed', message: 'Erro ao excluir job.' }, 500);
  }
};
