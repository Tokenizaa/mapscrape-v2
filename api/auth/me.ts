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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const authHeader = req.headers?.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }

  try {
    const supabase = buildSupabase();
    const token = authHeader.slice('Bearer '.length).trim();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Token inválido ou expirado.' });
      return;
    }

    const authUser = data.user;
    let profile: { id?: string; email?: string; display_name?: string; role?: string } | null = null;

    // Legacy profile data is optional. Never make a valid Auth session depend on it.
    try {
      const { data: found } = await supabase
        .from('users')
        .select('id,email,display_name,role')
        .eq('id', authUser.id)
        .maybeSingle();
      profile = found;
    } catch {
      profile = null;
    }

    const email = authUser.email || '';
    const metadataName = typeof authUser.user_metadata?.name === 'string'
      ? authUser.user_metadata.name
      : '';
    const name = profile?.display_name || metadataName || email.split('@')[0] || 'Usuário';
    const role = profile?.id === authUser.id && profile.role === 'admin' ? 'admin' : 'user';

    res.status(200).json({
      user: { id: authUser.id, email: profile?.email || email, name, role },
    });
  } catch (error) {
    console.error('Session API error:', error);
    res.status(503).json({
      error: 'API de autenticação indisponível.',
      detail: error instanceof Error ? error.message : 'Erro desconhecido.',
    });
  }
}
