import { createClient } from '@supabase/supabase-js';
import { json } from '@/functions/_util';

function buildSupabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

export const onRequestGet = async (request: Request): Promise<Response> => {
  const authHeader = request.headers.get('authorization');
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return json({ error: 'Token de autenticação ausente.' }, 401);
  }

  try {
    const supabase = buildSupabase();
    const token = authHeader.slice('Bearer '.length).trim();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return json({ error: 'Token inválido ou expirado.' }, 401);
    }

    const authUser = data.user;
    let profile: { id?: string; email?: string; display_name?: string; role?: string } | null = null;
    try {
      const { data: found } = await supabase.from('users').select('id,email,display_name,role').eq('id', authUser.id).maybeSingle();
      profile = found;
    } catch { profile = null; }

    const email = authUser.email || '';
    const metadataName = typeof authUser.user_metadata?.name === 'string' ? authUser.user_metadata.name : '';
    const name = profile?.display_name || metadataName || email.split('@')[0] || 'Usuário';
    const role = profile?.id === authUser.id && profile.role === 'admin' ? 'admin' : 'user';

    return json({ user: { id: authUser.id, email: profile?.email || email, name, role } });
  } catch {
    return json({ error: 'API de autenticação indisponível.', detail: 'Erro desconhecido.' }, 503);
  }
};
