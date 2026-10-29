import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { listProjects, resolveProject, updateProject, deleteProject } from '@/src/server/db';
import { json, getBody } from '@/functions/_util';

export const onRequestGet = async (request: Request): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const scope = (auth as AuthOk).context.scope;

  try {
    const projects = await listProjects(scope, scope);
    return json({
      data: projects.map((p) => ({
        id: p.id,
        name: p.name,
        consumer_project: p.consumer_project,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
    });
  } catch {
    return json({ error: 'lead_query_failed', message: 'Erro ao listar projetos.' }, 500);
  }
};

export const onRequestPost = async (request: Request): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const scope = (auth as AuthOk).context.scope;

  const body = await getBody(request);
  const name = body?.name;
  if (!name || !String(name).trim()) {
    return json({ error: 'project_name_required', message: 'Nome do projeto é obrigatório.' }, 422);
  }

  try {
    const project = await resolveProject(scope, String(name).trim(), scope);
    return json({
      data: {
        id: project.id,
        name: project.name,
        consumer_project: project.consumer_project,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
    }, 201);
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao criar projeto.' }, 500);
  }
};
