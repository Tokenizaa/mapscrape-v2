import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Create Supabase client for admin operations
const supabaseAdmin: SupabaseClient = createClient(
  process.env.SUPABASE_DIRECT_CONNECTION?.trim() || '',
  process.env.SUPABASE_ACCESS_TOKEN?.trim() || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const authHeader = req.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticação ausente.' });
      return;
    }

    const token = authHeader.split(' ')[1];

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