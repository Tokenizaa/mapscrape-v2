import { createClient } from '@supabase/supabase-js';
import { json, getBody } from '@/functions/_util';

function buildSupabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

export const onRequestPost = async (request: Request): Promise<Response> => {
  try {
    const body = await getBody(request);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return json({ error: 'E-mail e senha são obrigatórios.' }, 400);
    }

    const supabase = buildSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session?.access_token) {
      return json({ error: 'Credenciais inválidas.' }, 401);
    }

    let profile: { id?: string; email?: string; display_name?: string; role?: string } | null = null;
    try {
      const { data: found } = await supabase.from('users').select('id,email,display_name,role').eq('id', data.user.id).maybeSingle();
      profile = found;
    } catch { profile = null; }

    const userEmail = data.user.email || email;
    const metadataName = typeof data.user.user_metadata?.name === 'string' ? data.user.user_metadata.name : '';
    const name = profile?.display_name || metadataName || userEmail.split('@')[0] || 'Usuário';
    const role = profile?.id === data.user.id && profile.role === 'admin' ? 'admin' : 'user';

    return json({ token: data.session.access_token, user: { id: data.user.id, email: userEmail, name, role } });
  } catch {
    return json({ error: 'authentication_unavailable', message: 'API de autenticação indisponível. Verifique a configuração do Supabase.' }, 503);
  }
};
