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
 * DELETE /api/history/:jobId
 * Deleta um job e todos os seus lugares. O usuário só pode deletar seus próprios jobs.
 * Autenticação: header Authorization: Bearer <access_token>
 */
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
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
    const jobId = req.query?.jobId || req.params?.jobId;

    if (!jobId) {
      res.status(400).json({ error: 'ID do job não informado.' });
      return;
    }

    // Verificar se o job pertence ao usuário antes de deletar
    const { data: job, error: jobError } = await supabase
      .from('searches')
      .select('id, user_id')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (jobError || !job) {
      res.status(404).json({ error: 'Job não encontrado.' });
      return;
    }

    // Deletar lugares do job primeiro, depois o job
    await supabase.from('places').delete().eq('job_id', jobId);
    const { error: deleteError } = await supabase.from('searches').delete().eq('id', jobId);

    if (deleteError) {
      console.error('Erro ao deletar job:', deleteError);
      res.status(503).json({ error: 'Erro ao deletar job.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Job deletado com sucesso.' });
  } catch (error) {
    console.error('Delete history API error:', error);
    res.status(503).json({ error: 'API de histórico indisponível.' });
  }
}
