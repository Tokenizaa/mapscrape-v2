import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { getJob, deleteJob } from '@/src/server/db';

/**
 * GET /api/v1/jobs/{id} — Status, progresso e contadores da coleta.
 * DELETE /api/v1/jobs/{id} — Exclui uma coleta e seus resultados.
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

  if (req.method === 'DELETE') {
    try {
      const job = await getJob(id, scope);
      if (!job) {
        res.status(404).json({ error: 'job_not_found', message: 'Coleta inexistente ou fora do escopo.' });
        return;
      }
      const deleted = await deleteJob(id, scope);
      if (!deleted) {
        res.status(500).json({ error: 'invalid_request', message: 'Erro ao excluir job.' });
        return;
      }
      res.status(200).json({ data: { id, status: 'deleted' } });
    } catch (error) {
      res.status(500).json({ error: 'job_query_failed', message: 'Erro ao excluir job.' });
    }
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use GET ou DELETE.' });
    return;
  }

  try {
    const job = await getJob(id, scope);
    if (!job) {
      res.status(404).json({ error: 'job_not_found', message: 'Coleta inexistente ou fora do escopo.' });
      return;
    }
    res.status(200).json({
      data: {
        id: job.id,
        segment: job.segment,
        project_name: job.project_name,
        project_id: job.project_id,
        category_id: job.category_id,
        location: job.location,
        limit_requested: job.limit_requested,
        status: job.status,
        status_message: job.status_message,
        total_found: job.total_found,
        total_collected: job.total_collected,
        total_duplicates: job.total_duplicates,
        total_errors: job.total_errors,
        current_step: job.current_step,
        created_at: job.created_at,
        completed_at: job.completed_at,
        isRunning: job.status === 'running',
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'job_query_failed', message: 'Erro ao consultar job.' });
  }
}
