export const onRequestPost = async (context: any): Promise<Response> => {
  const req = context.request;
  const SUPABASE_URL = context.env?.SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const SUPABASE_ANON_KEY = context.env?.SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: 'authentication_unavailable', message: 'SUPABASE_URL e SUPABASE_ANON_KEY não configurados.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const bodyText = await req.text();
    let body: any = {};
    try { body = JSON.parse(bodyText); } catch { body = {}; }
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'E-mail e senha são obrigatórios.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok || !data.access_token || !data.user) {
      return new Response(JSON.stringify({ error: 'Credenciais inválidas.', detail: data.msg || data.message || 'Erro de autenticação.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userEmail = data.user.email || email;
    const userMetadata = data.user.user_metadata ?? {};
    const profileName = typeof userMetadata.name === 'string' ? userMetadata.name : '';
    const name = profileName || userEmail.split('@')[0] || 'Usuário';
    const appMetadata = data.user.app_metadata ?? {};
    const role = appMetadata.platform_role === 'platform_admin' ? 'admin' : 'user';

    return new Response(JSON.stringify({
      token: data.access_token,
      user: { id: data.user.id, email: userEmail, name, role },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'authentication_unavailable', message: error?.message ?? 'Erro desconhecido.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
