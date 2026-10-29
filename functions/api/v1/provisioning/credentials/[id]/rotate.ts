import { randomBytes, randomUUID } from 'node:crypto';
import { hashApiKey } from '@/functions/_auth';
import { createApiCredential, revokeApiCredential, listApiCredentials } from '@/src/server/db';
import { json, getRequest, getParams, getProvisioningToken } from '@/functions/_util';

export const onRequestPost = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const expected = context.env?.MAPSCRAPE_PROVISIONING_TOKEN?.trim() || process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  if (!expected) return json({ error: 'provisioning_unavailable' }, 503);
  const token = getProvisioningToken(req);
  if (!token || String(token).trim() !== expected) return json({ error: 'provisioning_unauthorized' }, 401);

  const params = getParams(context);
  const id = params.id;
  if (!id) return json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' }, 404);

  try {
    const credentials = await listApiCredentials();
    const existing = credentials.find((c) => c.id === id && c.status === 'active');
    if (!existing) return json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' }, 404);

    const revoked = await revokeApiCredential(id);
    if (!revoked) return json({ error: 'credential_rotation_conflict', message: 'Conflito ao revogar a credencial.' }, 409);

    const apiKey = randomBytes(32).toString('hex');
    const keyHash = hashApiKey(apiKey);
    const credentialId = `cred_${randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    try {
      await createApiCredential({ id: credentialId, consumerName: existing.consumer_name, consumerProject: existing.consumer_project, keyHash, createdAt: now });
      return json({ data: { credentialId, previousCredentialId: id, apiKey, consumerName: existing.consumer_name, consumerProject: existing.consumer_project, revealOnce: true } }, 201);
    } catch {
      return json({ error: 'invalid_request', message: 'Falha ao emitir nova chave; a anterior permanece revogada.' }, 500);
    }
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao rotacionar credencial.' }, 500);
  }
};
