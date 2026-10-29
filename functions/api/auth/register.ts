export const onRequestPost = async (context: any): Promise<Response> => {
  const req = context.request;
  const processEnv = typeof process !== 'undefined' ? process.env : {};
  const SUPABASE_URL = context.env?.SUPABASE_URL?.trim() || processEnv.SUPABASE_URL?.trim();
  const SUPABASE_ANON_KEY = context.env?.SUPABASE_ANON_KEY?.trim() || processEnv.SUPABASE_ANON_KEY?.trim();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: 'authentication_unavailable', message: 'SUPABASE_URL e SUPABASE_ANON_KEY não configurados.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const bodyText = await req.text();
    let body: any = {};
    try { body = JSON.parse(bodyText); } catch { body = {}; }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'E-mail e senha são obrigatórios.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (password.length < 12) {
      return new Response(JSON.stringify({ error: 'A senha deve ter pelo menos 12 caracteres.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const displayName = name || email.split('@')[0];

    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, options: { data: { name: displayName } } }),
    });

    const data = await res.json();

    if (!res.ok) {
      const message = /already registered|already exists/i.test(data.msg ?? data.message ?? '')
        ? 'Este e-mail já está cadastrado. Faça login.'
        : (data.msg ?? data.message ?? 'Erro ao cadastrar.');
      return new Response(JSON.stringify({ error: message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!data.user) {
      return new Response(JSON.stringify({ error: 'O Supabase Auth não retornou o usuário criado.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ id: data.user.id, email, display_name: displayName, role: 'user', created_at: new Date().toISOString() }),
      }).catch(() => {});
    } catch {}

    if (!data.session) {
      return new Response(JSON.stringify({
        token: '', requiresEmailConfirmation: true,
        message: 'Conta criada. Confirme seu e-mail e depois faça login.',
        user: { id: data.user.id, email, name: displayName, role: 'user' },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      token: data.session.access_token,
      user: { id: data.user.id, email, name: displayName, role: 'user' },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'API de autenticação indisponível.', detail: error?.message ?? 'Erro desconhecido.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
};
