import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { listProjects, resolveProject, updateProject, deleteProject } from '@/src/server/db';
import { json, getBody, getParams } from '@/functions/_util';

export const onRequestGet = async (
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
    return json({ error: 'project_not_found', message: 'Projeto não encontrado.' }, 404);
  }

  try {
    const projects = await listProjects(scope, scope);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return json({ error: 'project_not_found', message: 'Projeto inexistente ou fora do escopo.' }, 404);
    }
    return json({
      data: {
        id: project.id,
        name: project.name,
        consumer_project: project.consumer_project,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
    });
  } catch {
    return json({ error: 'project_query_failed', message: 'Erro ao consultar projeto.' }, 500);
  }
};

export const onRequestPut = async (
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
    return json({ error: 'project_not_found', message: 'Projeto não encontrado.' }, 404);
  }

  const body = await getBody(request);
  const name = body?.name;
  if (!name || !String(name).trim()) {
    return json({ error: 'project_name_required', message: 'Nome do projeto é obrigatório.' }, 422);
  }

  try {
    const updated = await updateProject(scope, id, String(name).trim(), scope);
    if (!updated) {
      return json({ error: 'project_not_found', message: 'Projeto inexistente ou fora do escopo.' }, 404);
    }
    return json({
      data: {
        id: updated.id,
        name: updated.name,
        consumer_project: updated.consumer_project,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao atualizar projeto.' }, 500);
  }
};

export const onRequestDelete = async (
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
    return json({ error: 'project_not_found', message: 'Projeto não encontrado.' }, 404);
  }

  try {
    const deleted = await deleteProject(scope, id, scope);
    if (!deleted) {
      return json({ error: 'project_not_found', message: 'Projeto inexistente ou fora do escopo.' }, 404);
    }
    return json({ data: { id, status: 'deleted' } });
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao excluir projeto.' }, 500);
  }
};
