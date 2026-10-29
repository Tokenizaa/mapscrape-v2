import { revokeApiCredential, listApiCredentials } from '@/src/server/db';
import { json, getRequest, getParams, getProvisioningToken } from '@/functions/_util';

export const onRequestDelete = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const expected = context.env?.MAPSCRAPE_PROVISIONING_TOKEN?.trim() || process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  if (!expected) return json({ error: 'provisioning_unavailable' }, 503);
  const token = getProvisioningToken(req);
  if (!token || String(token).trim() !== expected) return json({ error: 'provisioning_unauthorized' }, 401);

  const params = getParams(context);
  const id = params.id;
  if (!id) return json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' }, 404);

  try {
    const revoked = await revokeApiCredential(id);
    if (!revoked) return json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' }, 404);
    return json({ data: { credentialId: id, status: 'revoked' } });
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao revogar credencial.' }, 500);
  }
};
