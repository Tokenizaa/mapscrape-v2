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
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return json({ error: 'E-mail e senha são obrigatórios.' }, 400);
    }
    if (password.length < 12) {
      return json({ error: 'A senha deve ter pelo menos 12 caracteres.' }, 400);
    }

    const supabase = buildSupabase();
    const displayName = name || email.split('@')[0];
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: displayName } } });

    if (error) {
      const message = /already registered|already exists/i.test(error.message)
        ? 'Este e-mail já está cadastrado. Faça login.'
        : error.message;
      return json({ error: message }, 400);
    }

    if (!data.user) {
      return json({ error: 'O Supabase Auth não retornou o usuário criado.' }, 500);
    }

    if (data.session) {
      try {
        await supabase.from('users').upsert({
          id: data.user.id, email, display_name: displayName, role: 'user', created_at: new Date().toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: true });
      } catch { console.warn('Optional user profile could not be saved.'); }
    }

    if (!data.session) {
      return json({ token: '', requiresEmailConfirmation: true, message: 'Conta criada. Confirme seu e-mail e depois faça login.', user: { id: data.user.id, email, name: displayName, role: 'user' } }, 201);
    }

    return json({ token: data.session.access_token, user: { id: data.user.id, email, name: displayName, role: 'user' } }, 201);
  } catch {
    return json({ error: 'API de autenticação indisponível.', detail: 'Erro desconhecido.' }, 503);
  }
};
