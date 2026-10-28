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
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      return;
    }

    // Use Supabase Auth to sign in
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (error) {
      res.status(401).json({ error: 'Credenciais inválidas.' });
      return;
    }

    // Check if user has a profile in our users table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError || !userData) {
      res.status(404).json({ error: 'Perfil de usuário não encontrado. Cadastre-se primeiro.' });
      return;
    }

    // Return user profile and a session token for the frontend
    res.status(200).json({
      token: data.session?.access_token || '',
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.display_name,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error('Login API error:', error);
    res.status(503).json({
      error: 'authentication_unavailable',
      message: 'API de autenticação indisponível.',
    });
  }
}