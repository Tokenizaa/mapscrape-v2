import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'mapscrape-dev-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Simple in-memory user for development (replace with real user DB lookup in production)
const DEV_USER = {
  id: 'dev-user-1',
  username: 'dev',
};

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
  };
}

/**
 * JWT Authentication Middleware
 * Protects all state-changing and data-access endpoints.
 * Returns 401 if missing/invalid token, 403 if user not authorized.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    req.user = {
      id: payload.id,
      username: payload.username,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Optional JWT Middleware
 * Attaches user if token provided, but doesn't fail if absent.
 * Useful for endpoints that work both authenticated and unauthenticated.
 */
export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
      req.user = {
        id: payload.id,
        username: payload.username,
      };
    } catch {
      // Ignore invalid tokens in optional mode
    }
  }

  next();
}

/**
 * Job ownership middleware
 * Verifies that the requesting user owns the job ID specified in the request.
 * Used for endpoints that access specific job data (/api/places, /api/history, etc.)
 */
export function jobOwnershipMiddleware(required: boolean = true): (req: AuthRequest, res: Response, next: NextFunction) => void {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      if (required) {
        res.status(401).json({ error: 'Usuário não autenticado.' });
        return;
      }
      next();
      return;
    }

    const { id: user_id } = req.user;
    const jobId = req.params.id || req.query.jobId || req.body.jobId;

    if (!jobId) {
      if (required) {
        res.status(400).json({ error: 'ID da pesquisa não informado.' });
        return;
      }
      next();
      return;
    }

    try {
      const db = getDb();
      const res = await db.execute({
        sql: `SELECT user_id FROM searches WHERE id = ?`,
        args: [String(jobId)],
      });

      if (res.rows.length === 0) {
        res.status(404).json({ error: 'Pesquisa não encontrada.' });
        return;
      }

      const jobUserId = res.rows[0].user_id;

      if (jobUserId !== userId) {
        res.status(403).json({ error: 'Não tem permissão para acessar esta pesquisa.' });
        return;
      }

      next();
    } catch (error) {
      console.error('Job ownership check error:', error);
      res.status(500).json({ error: 'Erro ao verificar propriedade da pesquisa.' });
    }
  };
}

/**
 * Generate a JWT token for a user (used for login/development)
 */
export function generateToken(userId: string, username: string): string {
  return jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export { DEV_USER };