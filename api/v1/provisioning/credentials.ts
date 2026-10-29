import { randomBytes, randomUUID } from 'node:crypto';
import { authenticateProvisioning, hashApiKey } from '@/src/server/auth';
import {
  createApiCredential,
  findActiveApiCredential,
  revokeApiCredential,
  listApiCredentials,
} from '@/src/server/db';

/**
 * POST /api/v1/provisioning/credentials — Emite credencial individual de consumidor.
 * GET  /api/v1/provisioning/credentials — Lista metadados (sem chaves em texto claro).
 * Autenticação: X-MapScrape-Provisioning-Token (infraestrutura autorizada apenas).
 */
export default async function handler(req: any, res: any): Promise<void> {
  const prov = await authenticateProvisioning(req);
  if (!prov.ok) {
    const e = prov as { status: number; error: string };
    res.status(e.status).json({ error: e.error });
    return;
  }

  if (req.method === 'POST') {
    let body: any;
    try {
      body = req.body || {};
    } catch {
      res.status(422).json({ error: 'invalid_request', message: 'Body JSON inválido.' });
      return;
    }

    const consumerName = body?.consumerName;
    const consumerProject = body?.consumerProject;
    if (!consumerName || !String(consumerName).trim()) {
      res.status(422).json({ error: 'invalid_request', message: 'consumerName é obrigatório.' });
      return;
    }
    if (!consumerProject || !String(consumerProject).trim()) {
      res.status(422).json({ error: 'invalid_request', message: 'consumerProject é obrigatório.' });
      return;
    }
    const name = String(consumerName).trim();
    const project = String(consumerProject).trim();
    if (name.length > 120) {
      res.status(422).json({ error: 'invalid_request', message: 'consumerName no máximo 120 caracteres.' });
      return;
    }
    if (project.length > 200) {
      res.status(422).json({ error: 'invalid_request', message: 'consumerProject no máximo 200 caracteres.' });
      return;
    }

    // Conflito: projeto com credencial ativa já existe.
    const existing = (await listApiCredentials()).some(
      (c) => c.consumer_project === project && c.status === 'active',
    );
    if (existing) {
      res.status(409).json({ error: 'credential_already_exists', message: 'Projeto já possui credencial ativa.' });
      return;
    }

    const apiKey = randomBytes(32).toString('hex');
    const keyHash = hashApiKey(apiKey);
    const credentialId = `cred_${randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    try {
      await createApiCredential({
        id: credentialId,
        consumerName: name,
        consumerProject: project,
        keyHash,
        createdAt: now,
      });
      res.status(201).json({
        data: {
          credentialId,
          apiKey,
          consumerName: name,
          consumerProject: project,
          revealOnce: true,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'invalid_request', message: 'Erro ao criar credencial.' });
    }
    return;
  }

  if (req.method === 'GET') {
    try {
      const credentials = await listApiCredentials();
      res.status(200).json({
        data: credentials.map((c) => ({
          id: c.id,
          consumer_name: c.consumer_name,
          consumer_project: c.consumer_project,
          status: c.status,
          created_at: c.created_at,
          last_used_at: c.last_used_at,
          revoked_at: c.revoked_at,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: 'invalid_request', message: 'Erro ao listar credenciais.' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Método não permitido.', message: 'Use GET ou POST.' });
}
