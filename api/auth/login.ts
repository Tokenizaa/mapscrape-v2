import { createClient, SupabaseClient } from '@supabase/supabase-js';

function buildSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos.');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      return;
    }

    const supabase = buildSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session?.access_token) {
      res.status(401).json({ error: 'Credenciais inválidas.' });
      return;
    }

    // The Supabase Auth UUID is the identity source. The legacy users table is
    // optional metadata; an absent/inaccessible profile must never block login.
    let profile: { id?: string; email?: string; display_name?: string; role?: string } | null = null;
    try {
      const { data: found } = await supabase
        .from('users')
        .select('id,email,display_name,role')
        .eq('id', data.user.id)
        .maybeSingle();
      profile = found;
    } catch {
      profile = null;
    }

    const userEmail = data.user.email || email;
    const metadataName = typeof data.user.user_metadata?.name === 'string'
      ? data.user.user_metadata.name
      : '';
    const name = profile?.display_name || metadataName || userEmail.split('@')[0] || 'Usuário';
    const role = profile?.id === data.user.id && profile.role === 'admin' ? 'admin' : 'user';

    res.status(200).json({
      token: data.session.access_token,
      user: { id: data.user.id, email: userEmail, name, role },
    });
  } catch (error) {
    console.error('Login API error:', error);
    res.status(503).json({
      error: 'authentication_unavailable',
      message: 'API de autenticação indisponível. Verifique a configuração do Supabase.',
    });
  }
}
