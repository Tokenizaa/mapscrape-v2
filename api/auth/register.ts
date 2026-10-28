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
    const { name, email, password } = req.body as { name: string; email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      return;
    }

    // Check if user already exists in our system
    const { data: existingUser, error: findError } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('email', email.toLowerCase())
      .single();

    if (findError && findError.code !== 'PGRST116') {
      console.error('Error checking existing user:', findError);
    }

    if (existingUser) {
      res.status(409).json({ error: 'Este e-mail já está em uso.' });
      return;
    }

    // Use Supabase Auth to sign up
    const { data, error } = await supabaseAdmin.auth.signUp({
      email: email.toLowerCase(),
      password,
      options: {
        data: {
          name: name || email.split('@')[0],
        } as Record<string, unknown>,
      },
    });

    if (error) {
      res.status(400).json({ error: error.message || 'Erro ao criar conta.' });
      return;
    }

    if (!data.user) {
      res.status(500).json({ error: 'Não foi possível criar o usuário no Supabase Auth.' });
      return;
    }

    // Create profile in our users table linked to the Supabase Auth user
    const userId = data.user.id;
    const displayName = name || email.split('@')[0];

    await supabaseAdmin.from('users').insert({
      id: userId,
      email: email.toLowerCase(),
      display_name: displayName,
      role: 'user',
      created_at: new Date().toISOString(),
    });

    // Return user profile and session token
    res.status(201).json({
      token: data.session?.access_token || '',
      user: {
        id: userId,
        email: email.toLowerCase(),
        name: displayName,
        role: 'user',
      },
    });
  } catch (error) {
    console.error('Registration API error:', error);
    res.status(503).json({
      error: 'API de autenticação indisponível.',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}