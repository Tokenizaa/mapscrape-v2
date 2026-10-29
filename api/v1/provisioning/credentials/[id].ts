import { authenticateProvisioning } from '@/src/server/auth';
import { revokeApiCredential, listApiCredentials } from '@/src/server/db';

/**
 * DELETE /api/v1/provisioning/credentials/{id} — Revoga credencial ativa.
 * Autenticação: X-MapScrape-Provisioning-Token.
 */
export default async function handler(req: any, res: any): Promise<void> {
  const prov = await authenticateProvisioning(req);
  if (!prov.ok) {
    const e = prov as { status: number; error: string };
    res.status(e.status).json({ error: e.error });
    return;
  }

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use DELETE.' });
    return;
  }

  const id = req.query?.id || req.params?.id;
  if (!id) {
    res.status(404).json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' });
    return;
  }

  try {
    const revoked = await revokeApiCredential(id);
    if (!revoked) {
      res.status(404).json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' });
      return;
    }
    res.status(200).json({ data: { credentialId: id, status: 'revoked' } });
  } catch (error) {
    res.status(500).json({ error: 'invalid_request', message: 'Erro ao revogar credencial.' });
  }
}
