import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import {
  updateSearchCategory,
  deleteSearchCategory,
} from '@/src/server/db';

/**
 * PATCH /api/v1/categories/{id} — Atualiza nome da categoria de pesquisa.
 * DELETE /api/v1/categories/{id} — Exclui categoria de pesquisa.
 * Autenticação: Bearer <MAPSCRAPE_API_KEY> ou Bearer <session Supabase>.
 */
export default async function handler(req: any, res: any): Promise<void> {
  const auth = await authenticateRequest(req.headers?.authorization);
  if (sendAuthError(res, auth)) return;
  const scope = (auth as AuthOk).context.scope;
  const id = req.query?.id || req.params?.id;

  if (!id) {
    res.status(404).json({ error: 'category_not_found', message: 'Categoria não encontrada.' });
    return;
  }

  if (req.method === 'PATCH') {
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
      const updated = await updateSearchCategory(scope, id, String(name).trim(), scope);
      if (!updated) {
        res.status(404).json({ error: 'category_not_found', message: 'Categoria não encontrada.' });
        return;
      }
      res.status(200).json({
        data: {
          id: updated.id,
          name: updated.name,
          consumer_project: updated.consumer_project,
          created_at: updated.created_at,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar categoria.';
      if (message === 'category_name_conflict') {
        res.status(409).json({ error: 'category_name_conflict', message });
        return;
      }
      if (message === 'category_name_required') {
        res.status(422).json({ error: 'category_name_required', message });
        return;
      }
      res.status(500).json({ error: 'invalid_request', message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const deleted = await deleteSearchCategory(scope, id, scope);
      if (!deleted) {
        res.status(404).json({ error: 'category_not_found', message: 'Categoria não encontrada.' });
        return;
      }
      res.status(200).json({ data: { id, status: 'deleted' } });
    } catch (error) {
      res.status(500).json({ error: 'invalid_request', message: 'Erro ao excluir categoria.' });
    }
    return;
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  res.status(405).json({ error: 'Método não permitido.', message: 'Use PATCH ou DELETE.' });
}
