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
 * GET /api/places
 * Lista lugares com paginação e filtros.
 * Query params:
 *   offset, limit, sortBy, sortOrder, jobId, query, category
 * Autenticação: header Authorization: Bearer <access_token>
 * Retorna: { places: PlaceRecord[], total: number }
 */
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  try {
    const supabase = buildSupabaseAdmin();

    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticação ausente.' });
      return;
    }

    const token = authHeader.split(' ')[1];

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: 'Token inválido ou expirado.' });
      return;
    }

    const userId = userData.user.id;

    const {
      offset = '0',
      limit = '25',
      sortBy = 'collected_at',
      sortOrder = 'desc',
      jobId,
      query,
      category,
    } = req.query;

    const offsetNum = Math.max(0, parseInt(String(offset), 10) || 0);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 25));

    // Primeiro, obter os job_ids do usuário (para isolamento de dados)
    const { data: userJobs, error: jobsError } = await supabase
      .from('searches')
      .select('id')
      .eq('user_id', userId);

    if (jobsError) {
      console.error('Erro ao buscar jobs do usuário:', jobsError);
      res.status(503).json({ error: 'Erro ao buscar lugares.' });
      return;
    }

    const userJobIds = (userJobs || []).map((j: any) => j.id);

    if (userJobIds.length === 0) {
      res.status(200).json({ places: [], total: 0 });
      return;
    }

    // Montar filtro de job_id
    let placeQuery = supabase.from('places').select('*', { count: 'exact' });

    // Filtrar apenas places dos jobs do usuário
    placeQuery = placeQuery.in('job_id', userJobIds);

    // Filtro opcional por job específico
    if (jobId) {
      placeQuery = placeQuery.eq('job_id', jobId);
    }

    // Filtro de busca textual (nome, categoria, endereço, telefone, website)
    if (query && String(query).trim()) {
      const q = String(query).trim();
      placeQuery = placeQuery.or(`name.ilike.%${q}%,category.ilike.%${q}%,address.ilike.%${q}%,phone.ilike.%${q}%,website.ilike.%${q}%`);
    }

    // Filtro de categoria
    if (category && String(category).trim()) {
      placeQuery = placeQuery.ilike('category', `%${String(category).trim()}%`);
    }

    // Ordenação
    const ascending = String(sortOrder).toLowerCase() === 'asc';
    placeQuery = placeQuery.order(sortBy, { ascending });

    // Paginação
    placeQuery = placeQuery.range(offsetNum, offsetNum + limitNum - 1);

    const { data: places, error: placesError, count } = await placeQuery;

    if (placesError) {
      console.error('Erro ao buscar places:', placesError);
      res.status(503).json({ error: 'Erro ao buscar lugares.' });
      return;
    }

    res.status(200).json({
      places: places || [],
      total: count || 0,
    });
  } catch (error) {
    console.error('Places API error:', error);
    res.status(503).json({ error: 'API de lugares indisponível.' });
  }
}
