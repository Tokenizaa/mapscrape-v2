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
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      return;
    }
    if (password.length < 12) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 12 caracteres.' });
      return;
    }

    const supabase = buildSupabase();
    const displayName = name || email.split('@')[0];
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: displayName } },
    });

    if (error) {
      const message = /already registered|already exists/i.test(error.message)
        ? 'Este e-mail já está cadastrado. Faça login.'
        : error.message;
      res.status(400).json({ error: message });
      return;
    }

    if (!data.user) {
      res.status(500).json({ error: 'O Supabase Auth não retornou o usuário criado.' });
      return;
    }

    // Profile writes use the server-only service role; never expose this key to clients.
    try {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (serviceKey) {
        const profileDb = createClient(process.env.SUPABASE_URL!.trim(), serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        });
        const { error: profileError } = await profileDb.schema('mapscrape').from('users').upsert({
          id: data.user.id,
          email,
          display_name: displayName,
          role: 'user',
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (profileError) console.warn('Optional user profile could not be saved:', profileError.message);
      } else {
        console.warn('SUPABASE_SERVICE_ROLE_KEY ausente: perfil não foi persistido.');
      }
    } catch (profileError) {
      console.warn('Optional user profile could not be saved:', profileError);
    }

    if (!data.session) {
      res.status(201).json({
        token: '',
        requiresEmailConfirmation: true,
        message: 'Conta criada. Confirme seu e-mail e depois faça login.',
        user: { id: data.user.id, email, name: displayName, role: 'user' },
      });
      return;
    }

    res.status(201).json({
      token: data.session.access_token,
      user: { id: data.user.id, email, name: displayName, role: 'user' },
    });
  } catch (error) {
    console.error('Registration API error:', error);
    res.status(503).json({
      error: 'API de autenticação indisponível.',
      detail: error instanceof Error ? error.message : 'Erro desconhecido.',
    });
  }
}
