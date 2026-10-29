import { randomBytes, randomUUID } from 'node:crypto';
import { authenticateProvisioning, hashApiKey } from '@/src/server/auth';
import {
  createApiCredential,
  revokeApiCredential,
  listApiCredentials,
} from '@/src/server/db';

/**
 * POST /api/v1/provisioning/credentials/{id}/rotate — Rotaciona credencial ativa.
 * Revoga a chave anterior antes de criar a substituta. Se a criação falhar, a anterior
 * permanece revogada.
 * Autenticação: X-MapScrape-Provisioning-Token.
 */
export default async function handler(req: any, res: any): Promise<void> {
  const prov = await authenticateProvisioning(req);
  if (!prov.ok) {
    const e = prov as { status: number; error: string };
    res.status(e.status).json({ error: e.error });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use POST.' });
    return;
  }

  const id = req.query?.id || req.params?.id;
  if (!id) {
    res.status(404).json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' });
    return;
  }

  try {
    const credentials = await listApiCredentials();
    const existing = credentials.find((c) => c.id === id && c.status === 'active');
    if (!existing) {
      res.status(404).json({ error: 'active_credential_not_found', message: 'Credencial ativa não encontrada.' });
      return;
    }

    // Revoga a chave anterior.
    const revoked = await revokeApiCredential(id);
    if (!revoked) {
      res.status(409).json({ error: 'credential_rotation_conflict', message: 'Conflito ao revogar a credencial.' });
      return;
    }

    // Emite a substituta.
    const apiKey = randomBytes(32).toString('hex');
    const keyHash = hashApiKey(apiKey);
    const credentialId = `cred_${randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    try {
      await createApiCredential({
        id: credentialId,
        consumerName: existing.consumer_name,
        consumerProject: existing.consumer_project,
        keyHash,
        createdAt: now,
      });
      res.status(201).json({
        data: {
          credentialId,
          previousCredentialId: id,
          apiKey,
          consumerName: existing.consumer_name,
          consumerProject: existing.consumer_project,
          revealOnce: true,
        },
      });
    } catch (error) {
      // A antiga permanece revogada; informe que a emissão falhou.
      res.status(500).json({ error: 'invalid_request', message: 'Falha ao emitir nova chave; a anterior permanece revogada.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'invalid_request', message: 'Erro ao rotacionar credencial.' });
  }
}
