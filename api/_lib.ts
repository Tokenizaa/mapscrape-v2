import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabase(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.SUPABASE_DIRECT_CONNECTION || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis server-side da Vercel.');
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
  const url = (process.env.SUPABASE_URL || process.env.SUPABASE_DIRECT_CONNECTION || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) throw new Error('Configure SUPABASE_URL e SUPABASE_ANON_KEY para validar sessões.');
  const authClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) { res.status(401).json({ error: 'Token inválido ou expirado.' }); return null; }
  return data.user;
}

export function fail(res: any, error: unknown, label: string) {
  console.error(label, error);
  const message = error instanceof Error ? error.message : 'Erro desconhecido.';
  const missingTable = /PGRST205|does not exist|schema cache/i.test(message);
  const missingConfig = /Configure SUPABASE_|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(message);
  res.status(missingConfig ? 503 : missingTable ? 503 : 500).json({
    error: missingConfig ? 'Configuração do servidor Supabase incompleta.' : missingTable ? 'Esquema do banco incompleto. Aplique a migração Supabase versionada.' : 'Falha ao processar a solicitação.',
    detail: process.env.NODE_ENV === 'production' ? undefined : message,
  });
}
