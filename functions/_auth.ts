/**
 * Helper de autenticação para Cloudflare Pages Functions.
 * Extrai o contexto (request, env) e autentica via Supabase (ANON key ou service_role).
 */
import { json } from './_util';

function getProcessEnv(): Record<string, string | undefined> {
  return typeof process !== 'undefined' ? process.env : {};
}

export interface AuthContext {
  kind: 'consumer' | 'user';
  scope: string;
  credentialId?: string;
  email?: string;
}

export interface AuthError {
  ok: false;
  status: number;
  error: string;
}

export interface AuthOk {
  ok: true;
  context: AuthContext;
}

export type AuthResult = AuthOk | AuthError;

export async function authenticateRequest(context: any): Promise<AuthResult> {
  const req = context.request;
  const env = context.env || {};
  const SUPABASE_URL = env.SUPABASE_URL?.trim() || getProcessEnv().SUPABASE_URL?.trim();
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY?.trim() || getProcessEnv().SUPABASE_ANON_KEY?.trim();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, status: 503, error: 'authentication_unavailable' };
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Credencial de autenticação ausente.' };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Credencial de autenticação ausente.' };
  }

  // 1) Tenta como chave de API do consumidor (hash SHA-256)
  try {
    const keyHash = await sha256(token);
    const supabaseUrl = SUPABASE_URL;

    // Consulta a credencial via REST do Supabase
    const res = await fetch(`${supabaseUrl}/rest/v1/api_credentials?key_hash=eq.${keyHash}&status=eq.active&select=id,consumer_project`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        // Atualiza last_used_at (best effort)
        try {
          await fetch(`${supabaseUrl}/rest/v1/api_credentials?id=eq.${data[0].id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ last_used_at: new Date().toISOString() }),
          }).catch(() => {});
        } catch {}
        return {
          ok: true,
          context: { kind: 'consumer', scope: data[0].consumer_project, credentialId: data[0].id },
        };
      }
    }
  } catch {
    return { ok: false, status: 503, error: 'authentication_unavailable' };
  }

  // 2) Tenta como token de sessão Supabase (interface web)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });

    const body = await res.text();
    if (res.ok) {
      try {
        const data = JSON.parse(body);
        if (data?.id) {
          const userId = data.id;
          const email = data.email ?? '';
          return {
            ok: true,
            context: { kind: 'user', scope: userId, email },
          };
        }
      } catch {}
    }

    return { ok: false, status: 401, error: `Token inválido ou expirado (supabase status: ${res.status}, body: ${body.substring(0, 100)})` };
  } catch (e: any) {
    return { ok: false, status: 503, error: `authentication_unavailable: ${e?.message}` };
  }
}

export async function authenticateProvisioning(context: any): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const req = context.request as Request;
  const env = context.env || {};
  const expected = String(env.MAPSCRAPE_PROVISIONING_TOKEN ?? getProcessEnv().MAPSCRAPE_PROVISIONING_TOKEN ?? '').trim();
  const provisioningToken = req.headers.get('x-mapscrape-provisioning-token')?.trim();

  // Keep the server-side bootstrap token as a supported operational credential.
  if (expected && provisioningToken && provisioningToken === expected) return { ok: true };

  // The web UI uses a Supabase session. Only platform admins may manage API credentials.
  const authorization = req.headers.get('authorization') || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  const supabaseUrl = String(env.SUPABASE_URL ?? getProcessEnv().SUPABASE_URL ?? '').trim();
  const anonKey = String(env.SUPABASE_ANON_KEY ?? getProcessEnv().SUPABASE_ANON_KEY ?? '').trim();

  if (bearer && supabaseUrl && anonKey) {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
      });
      if (response.ok) {
        const user = await response.json() as { app_metadata?: { platform_role?: string } };
        if (user?.app_metadata?.platform_role === 'platform_admin') return { ok: true };
      }
    } catch {
      // Fail closed; do not expose upstream authentication details.
    }
  }

  if (!expected && (!supabaseUrl || !anonKey)) {
    return { ok: false, status: 503, error: 'provisioning_unavailable' };
  }
  return { ok: false, status: 401, error: 'provisioning_unauthorized' };
}

export async function hashApiKey(apiKey: string): Promise<string> {
  return sha256(apiKey.trim());
}

async function sha256(input: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sendAuthError(_response: any, result: AuthResult): Response | null {
  if (result.ok === false) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
