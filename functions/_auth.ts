/**
 * Helper de autenticação para Cloudflare Pages Functions.
 * Extrai o contexto (request, env) e autentica via Supabase (ANON key ou service_role).
 */
import { json } from './_util';

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
  const SUPABASE_URL = env.SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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

    // API credentials live in the private mapscrape schema and require server credentials.
    if (SUPABASE_SERVICE_ROLE_KEY) {
      const profileHeaders = {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Accept-Profile': 'mapscrape',
        'Content-Profile': 'mapscrape',
      };
      const res = await fetch(`${supabaseUrl}/rest/v1/api_credentials?key_hash=eq.${keyHash}&status=eq.active&select=id,consumer_project`, {
        headers: profileHeaders,
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          // Atualiza last_used_at (best effort).
          try {
            await fetch(`${supabaseUrl}/rest/v1/api_credentials?id=eq.${data[0].id}`, {
              method: 'PATCH',
              headers: {
                ...profileHeaders,
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
      } else if (res.status >= 500) {
        return { ok: false, status: 503, error: 'authentication_unavailable' };
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
  const req = context.request;
  const env = context.env || {};
  const expected = env.MAPSCRAPE_PROVISIONING_TOKEN?.trim() || process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  if (!expected) {
    return { ok: false, status: 503, error: 'provisioning_unavailable' };
  }
  const token = req.headers.get('x-mapscrape-provisioning-token');
  if (!token || String(token).trim() !== expected) {
    return { ok: false, status: 401, error: 'provisioning_unauthorized' };
  }
  return { ok: true };
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

export function sendAuthError(_json: any, result: AuthResult): Response | false {
  if ('error' in result) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return false;
}
