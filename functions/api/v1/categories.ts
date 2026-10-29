import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { listSearchCategories, resolveSearchCategory } from '@/src/server/db';
import { json, getRequest, getBodyJson } from '@/functions/_util';

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;

  try {
    const categories = await listSearchCategories(scope, scope);
    return json({
      data: categories.map((c) => ({
        id: c.id, name: c.name, consumer_project: c.consumer_project, created_at: c.created_at,
      })),
    });
  } catch {
    return json({ error: 'lead_query_failed', message: 'Erro ao listar categorias.' }, 500);
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
  const name = body?.name;
  if (!name || !String(name).trim()) {
    return json({ error: 'category_name_required', message: 'Nome da categoria é obrigatório.' }, 422);
  }

  try {
    const category = await resolveSearchCategory(scope, String(name).trim(), scope);
    return json({
      data: {
        id: category.id, name: category.name, consumer_project: category.consumer_project,
        created_at: category.created_at,
      },
    }, 201);
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao criar categoria.' }, 500);
  }
};
