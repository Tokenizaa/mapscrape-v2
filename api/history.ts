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

/**
 * GET /api/history
 * Lista os jobs (searches) do usuário autenticado, ordenados por created_at desc.
 * Autenticação: header Authorization: Bearer <access_token>
 */
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  try {
    const supabase = buildSupabaseAdmin();

    // Extrair o token do header Authorization
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticação ausente.' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verificar o token e obter o usuário
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: 'Token inválido ou expirado.' });
      return;
    }

    const userId = userData.user.id;

    // Buscar os jobs do usuário
    const { data: jobs, error: jobsError } = await supabase
      .from('searches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (jobsError) {
      console.error('Erro ao listar jobs:', jobsError);
      res.status(503).json({ error: 'Erro ao buscar histórico.' });
      return;
    }

    res.status(200).json(jobs || []);
  } catch (error) {
    console.error('History API error:', error);
    res.status(503).json({ error: 'API de histórico indisponível.' });
  }
}
