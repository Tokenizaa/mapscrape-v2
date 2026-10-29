import { authenticateProvisioning } from '@/src/server/auth';
import { revokeApiCredential, listApiCredentials } from '@/src/server/db';
import { json, getParams, getProvisioningToken } from '@/functions/_util';

function checkProvisioning(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  if (!expected) return { ok: false, status: 503, error: 'provisioning_unavailable' };
  const token = getProvisioningToken(request);
  if (!token || String(token).trim() !== expected) return { ok: false, status: 401, error: 'provisioning_unauthorized' };
  return { ok: true };
}

export const onRequestDelete = async (
  request: Request,
  context: { params?: Record<string, string | string[]> },
): Promise<Response> => {
  const prov = checkProvisioning(request);
  if (!prov.ok) return json({ error: prov.error }, prov.status);

  const params = getParams(context);
  const id = params.id;
  if (!id) {
    return json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' }, 404);
  }

  try {
    const revoked = await revokeApiCredential(id);
    if (!revoked) {
      return json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' }, 404);
    }
    return json({ data: { credentialId: id, status: 'revoked' } });
  } catch {
    return json({ error: 'invalid_request', message: 'Erro ao revogar credencial.' }, 500);
  }
};
