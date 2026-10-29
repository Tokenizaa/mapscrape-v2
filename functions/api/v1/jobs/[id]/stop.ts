import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { getJob, updateJobProgress } from '@/src/server/db';
import { json, getParams } from '@/functions/_util';

export const onRequestPost = async (
  request: Request,
  context: { params?: Record<string, string | string[]> },
): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;
  const params = getParams(context);
  const id = params.id;
  if (!id) {
    return json({ error: 'job_not_found', message: 'Coleta não encontrada.' }, 404);
  }

  try {
    const job = await getJob(id, scope);
    if (!job) {
      return json({ error: 'job_not_found', message: 'Coleta inexistente ou fora do escopo.' }, 404);
    }

    if (job.status !== 'running') {
      return json(
        { error: 'job_not_running', message: `A coleta já está em estado ${job.status}.` },
        409,
      );
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
