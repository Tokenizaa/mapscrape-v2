import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { getJob, updateJobProgress } from '@/src/server/db';
import { json, getRequest, getParams } from '@/functions/_util';

export const onRequestPost = async (context: any): Promise<Response> => {
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

    if (job.status !== 'running') {
      return json({ error: 'job_not_running', message: `A coleta já está em estado ${job.status}.` }, 409);
    }

    await updateJobProgress(id, {
      status: 'stopped',
      status_message: 'Interrompida pelo usuário.',
      completed_at: new Date().toISOString(),
    });

    return json({ data: { id, status: 'stopped' } });
  } catch {
    return json({ error: 'job_query_failed', message: 'Erro ao interromper job.' }, 500);
  }
};
