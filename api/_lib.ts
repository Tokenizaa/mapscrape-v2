import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabase(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.SUPABASE_DIRECT_CONNECTION || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!url || !key) throw new Error('Configuração Supabase ausente: configure SUPABASE_URL e SUPABASE_ANON_KEY (ou SERVICE_ROLE_KEY).');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

export async function requireUser(req: any, res: any) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return null;
  }
  const token = header.slice(7).trim();
  if (!token) { res.status(401).json({ error: 'Token de autenticação ausente.' }); return null; }
  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data.user) { res.status(401).json({ error: 'Token inválido ou expirado.' }); return null; }
  return data.user;
}

export function fail(res: any, error: unknown, label: string) {
  console.error(label, error);
  const message = error instanceof Error ? error.message : 'Erro desconhecido.';
  const missingTable = /PGRST205|does not exist|schema cache/i.test(message);
  res.status(missingTable ? 503 : 500).json({
    error: missingTable ? 'Esquema do banco incompleto. Aplique a migração Supabase versionada.' : 'Falha ao processar a solicitação.',
    detail: process.env.NODE_ENV === 'production' ? undefined : message,
  });
}
