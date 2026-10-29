export const onRequestGet = async (context: any): Promise<Response> => {
  const req = context.request;
  const processEnv = typeof process !== 'undefined' ? process.env : {};
  const SUPABASE_URL = context.env?.SUPABASE_URL?.trim() || processEnv.SUPABASE_URL?.trim();
  const SUPABASE_ANON_KEY = context.env?.SUPABASE_ANON_KEY?.trim() || processEnv.SUPABASE_ANON_KEY?.trim();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: 'authentication_unavailable', message: 'SUPABASE_URL e SUPABASE_ANON_KEY não configurados.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization');
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Token de autenticação ausente.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const token = authHeader.slice('Bearer '.length).trim();

    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await res.json();

    const authUser = data?.user ?? data;

    if (!res.ok || !authUser?.id) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const email = authUser.email || '';
    const userMetadata = authUser.user_metadata ?? {};
    const appMetadata = authUser.app_metadata ?? {};
    const profileName = typeof userMetadata.name === 'string' ? userMetadata.name : '';
    const name = profileName || email.split('@')[0] || 'Usuário';
    const role = appMetadata.platform_role === 'platform_admin' ? 'admin' : 'user';

    return new Response(JSON.stringify({ user: { id: authUser.id, email, name, role } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'API de autenticação indisponível.', detail: error?.message ?? 'Erro desconhecido.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
};
