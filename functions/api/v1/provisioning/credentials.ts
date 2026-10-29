import { randomBytes, randomUUID } from 'node:crypto';
import { authenticateProvisioning, hashApiKey } from '@/functions/_auth';
import { createApiCredential, listApiCredentials } from '@/src/server/db';
import { json, getRequest, getBodyJson, getProvisioningToken } from '@/functions/_util';

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const expected = context.env?.MAPSCRAPE_PROVISIONING_TOKEN?.trim() || process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  if (!expected) return json({ error: 'provisioning_unavailable' }, 503);
  const token = getProvisioningToken(req);
  if (!token || String(token).trim() !== expected) return json({ error: 'provisioning_unauthorized' }, 401);

  try {
    const credentials = await listApiCredentials();
    return json({
      data: credentials.map((c) => ({
        id: c.id, consumer_name: c.consumer_name, consumer_project: c.consumer_project,
        status: c.status, created_at: c.created_at, last_used_at: c.last_used_at, revoked_at: c.revoked_at,
      })),
    });
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao listar credenciais.' }, 500);
  }
};

export const onRequestPost = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const expected = context.env?.MAPSCRAPE_PROVISIONING_TOKEN?.trim() || process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  if (!expected) return json({ error: 'provisioning_unavailable' }, 503);
  const token = getProvisioningToken(req);
  if (!token || String(token).trim() !== expected) return json({ error: 'provisioning_unauthorized' }, 401);

  const body = await getBodyJson(req);
  const consumerName = body?.consumerName;
  const consumerProject = body?.consumerProject;
  if (!consumerName || !String(consumerName).trim()) return json({ error: 'invalid_request', message: 'consumerName é obrigatório.' }, 422);
  if (!consumerProject || !String(consumerProject).trim()) return json({ error: 'invalid_request', message: 'consumerProject é obrigatório.' }, 422);
  const name = String(consumerName).trim();
  const project = String(consumerProject).trim();
  if (name.length > 120) return json({ error: 'invalid_request', message: 'consumerName no máximo 120 caracteres.' }, 422);
  if (project.length > 200) return json({ error: 'invalid_request', message: 'consumerProject no máximo 200 caracteres.' }, 422);

  const existing = (await listApiCredentials()).some((c) => c.consumer_project === project && c.status === 'active');
  if (existing) return json({ error: 'credential_already_exists', message: 'Projeto já possui credencial ativa.' }, 409);

  const apiKey = randomBytes(32).toString('hex');
  const keyHash = hashApiKey(apiKey);
  const credentialId = `cred_${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();

  try {
    await createApiCredential({ id: credentialId, consumerName: name, consumerProject: project, keyHash, createdAt: now });
    return json({ data: { credentialId, apiKey, consumerName: name, consumerProject: project, revealOnce: true } }, 201);
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao criar credencial.' }, 500);
  }
};
