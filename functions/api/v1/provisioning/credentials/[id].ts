import { revokeApiCredential } from '@/src/server/db';
import { authenticateProvisioning } from '@/functions/_auth';
import { json, getParams } from '@/functions/_util';

export const onRequestDelete = async (context: any): Promise<Response> => {
  const auth = await authenticateProvisioning(context);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

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
