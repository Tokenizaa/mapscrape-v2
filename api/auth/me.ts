import { createClient, SupabaseClient } from '@supabase/supabase-js';

function buildSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const authHeader = req.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticação ausente.' });
      return;
    }

    const token = authHeader.split(' ')[1];

    const supabaseAdmin = buildSupabaseAdmin();

    // Verify the token using Supabase Admin client
    let payload: any;
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !data.user) {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
        return;
      }

      payload = data.user;
    } catch (verifyError) {
      res.status(401).json({ error: 'Token inválido ou expirado.' });
      return;
    }

    // Look up the user profile in our users table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name, role')
      .eq('id', payload.id)
      .single();

    if (userError || !userData) {
      res.status(404).json({ error: 'Perfil de usuário não encontrado.' });
      return;
    }

    res.status(200).json({
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.display_name,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error('Session API error:', error);
    res.status(503).json({
      error: 'API de autenticação indisponível.',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}