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
    const { name, email, password } = req.body as { name: string; email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      return;
    }

    const supabaseAdmin = buildSupabaseAdmin();

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
      // Se o email já existe no Supabase Auth (usuário órfão sem perfil na tabela users),
      // tenta fazer login automático. O handler de login agora auto-provisiona o perfil.
      const alreadyRegistered =
        error.message?.includes('User already registered') ||
        error.message?.includes('already registered') ||
        error.code === 'invalid_credentials';

      if (alreadyRegistered) {
        const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
          email: email.toLowerCase(),
          password,
        });

        if (!signInError && signInData?.user) {
          // Redireciona para o fluxo de login que auto-provisiona o perfil
          const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', signInData.user.id)
            .single();

          if (!userError && userData) {
            return res.status(200).json({
              token: signInData.session?.access_token || '',
              user: {
                id: userData.id,
                email: userData.email,
                name: userData.display_name,
                role: userData.role,
              },
            });
          }

          // Se ainda não tem perfil, o login.ts criará; aqui apenas retorna sucesso para o frontend tentar login
          return res.status(200).json({
            token: signInData.session?.access_token || '',
            user: {
              id: signInData.user.id,
              email: signInData.user.email,
              name: name || signInData.user.email?.split('@')[0] || 'Usuário',
              role: 'user',
              needsProfile: true,
            },
          });
        }
      }

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