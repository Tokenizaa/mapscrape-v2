import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import {
  listProjects,
  resolveProject,
  updateProject,
  deleteProject,
} from '@/src/server/db';

/**
 * GET /api/v1/projects — Lista projetos do escopo autenticado.
 * POST /api/v1/projects — Cria ou reutiliza projeto pelo nome (idempotente).
 * Autenticação: Bearer <MAPSCRAPE_API_KEY> (consumer) ou Bearer <session Supabase> (user).
 */
export default async function handler(req: any, res: any): Promise<void> {
  const auth = await authenticateRequest(req.headers?.authorization);
  if (sendAuthError(res, auth)) return;
  const context = auth as AuthOk;
  const scope = context.context.scope;

  if (req.method === 'GET') {
    try {
      const projects = await listProjects(scope, scope);
      res.status(200).json({
        data: projects.map((p) => ({
          id: p.id,
          name: p.name,
          consumer_project: p.consumer_project,
          created_at: p.created_at,
          updated_at: p.updated_at,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: 'lead_query_failed', message: 'Erro ao listar projetos.' });
    }
    return;
  }

  if (req.method === 'POST') {
    let body: any;
    try {
      body = req.body || {};
    } catch {
      res.status(422).json({ error: 'invalid_request', message: 'Body JSON inválido.' });
      return;
    }

    const name = body?.name;
    if (!name || !String(name).trim()) {
      res.status(422).json({ error: 'project_name_required', message: 'Nome do projeto é obrigatório.' });
      return;
    }

    try {
      const project = await resolveProject(scope, String(name).trim(), scope);
      res.status(201).json({
        data: {
          id: project.id,
          name: project.name,
          consumer_project: project.consumer_project,
          created_at: project.created_at,
          updated_at: project.updated_at,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar projeto.';
      res.status(500).json({ error: 'invalid_request', message });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Método não permitido.', message: 'Use GET ou POST.' });
}
