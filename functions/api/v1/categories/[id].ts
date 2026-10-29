import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { updateSearchCategory, deleteSearchCategory } from '@/src/server/db';
import { json, getBody, getParams } from '@/functions/_util';

export const onRequestPatch = async (
  request: Request,
  context: { params?: Record<string, string | string[]> },
): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const scope = (auth as AuthOk).context.scope;
  const params = getParams(context);
  const id = params.id;
  if (!id) {
    return json({ error: 'category_not_found', message: 'Categoria não encontrada.' }, 404);
  }

  const body = await getBody(request);
  const name = body?.name;
  if (!name || !String(name).trim()) {
    return json({ error: 'category_name_required', message: 'Nome da categoria é obrigatório.' }, 422);
  }

  try {
    const updated = await updateSearchCategory(scope, id, String(name).trim(), scope);
    if (!updated) {
      return json({ error: 'category_not_found', message: 'Categoria não encontrada.' }, 404);
    }
    return json({
      data: {
        id: updated.id, name: updated.name, consumer_project: updated.consumer_project,
        created_at: updated.created_at,
      },
    });
  } catch (error: any) {
    const message = error?.message ?? 'Erro ao atualizar categoria.';
    if (message === 'category_name_conflict') {
      return json({ error: 'category_name_conflict', message }, 409);
    }
    if (message === 'category_name_required') {
      return json({ error: 'category_name_required', message }, 422);
    }
    return json({ error: 'invalid_request', message }, 500);
  }
};

export const onRequestDelete = async (
  request: Request,
  context: { params?: Record<string, string | string[]> },
): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const scope = (auth as AuthOk).context.scope;
  const params = getParams(context);
  const id = params.id;
  if (!id) {
    return json({ error: 'category_not_found', message: 'Categoria não encontrada.' }, 404);
  }

  try {
    const deleted = await deleteSearchCategory(scope, id, scope);
    if (!deleted) {
      return json({ error: 'category_not_found', message: 'Categoria não encontrada.' }, 404);
    }
    return json({ data: { id, status: 'deleted' } });
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao excluir categoria.' }, 500);
  }
};
