import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import {
  listSearchCategories,
  resolveSearchCategory,
} from '@/src/server/db';

/**
 * GET /api/v1/categories — Lista categorias de pesquisa do escopo autenticado.
 * POST /api/v1/categories — Cria ou reutiliza categoria de pesquisa pelo nome (idempotente).
 * Autenticação: Bearer <MAPSCRAPE_API_KEY> (consumer) ou Bearer <session Supabase> (user).
 */
export default async function handler(req: any, res: any): Promise<void> {
  const auth = await authenticateRequest(req.headers?.authorization);
  if (sendAuthError(res, auth)) return;
  const scope = (auth as AuthOk).context.scope;

  if (req.method === 'GET') {
    try {
      const categories = await listSearchCategories(scope, scope);
      res.status(200).json({
        data: categories.map((c) => ({
          id: c.id,
          name: c.name,
          consumer_project: c.consumer_project,
          created_at: c.created_at,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: 'lead_query_failed', message: 'Erro ao listar categorias.' });
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
      res.status(422).json({ error: 'category_name_required', message: 'Nome da categoria é obrigatório.' });
      return;
    }

    try {
      const category = await resolveSearchCategory(scope, String(name).trim(), scope);
      res.status(201).json({
        data: {
          id: category.id,
          name: category.name,
          consumer_project: category.consumer_project,
          created_at: category.created_at,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar categoria.';
      res.status(500).json({ error: 'invalid_request', message });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Método não permitido.', message: 'Use GET ou POST.' });
}
