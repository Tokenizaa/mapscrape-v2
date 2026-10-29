import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { getJob, updateJobProgress } from '@/src/server/db';

/**
 * POST /api/v1/jobs/{id}/stop — Interrompe uma coleta em andamento.
 * Marca o job como 'stopped' no banco; a próxima consulta de status reflete o estado.
 * Autenticação: Bearer <MAPSCRAPE_API_KEY> ou Bearer <session Supabase>.
 */
export default async function handler(req: any, res: any): Promise<void> {
  const auth = await authenticateRequest(req.headers?.authorization);
  if (sendAuthError(res, auth)) return;
  const scope = (auth as AuthOk).context.scope;
  const id = req.query?.id || req.params?.id;

  if (!id) {
    res.status(404).json({ error: 'job_not_found', message: 'Coleta não encontrada.' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use POST.' });
    return;
  }

  try {
    const job = await getJob(id, scope);
    if (!job) {
      res.status(404).json({ error: 'job_not_found', message: 'Coleta inexistente ou fora do escopo.' });
      return;
    }

    if (job.status !== 'running') {
      res.status(409).json({
        error: 'job_not_running',
        message: `A coleta já está em estado ${job.status}.`,
      });
      return;
    }

    await updateJobProgress(id, {
      status: 'stopped',
      status_message: 'Interrompida pelo usuário.',
      completed_at: new Date().toISOString(),
    });

    res.status(200).json({ data: { id, status: 'stopped' } });
  } catch (error) {
    res.status(500).json({ error: 'job_query_failed', message: 'Erro ao interromper job.' });
  }
}
