import { getDb } from './db';

export type AuditLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AuditEvent {
  id: string;
  created_at: string;
  level: AuditLevel;
  category: string;
  event: string;
  message: string;
  job_id: string;
  metadata: string;
}

export async function initAuditLog(): Promise<void> {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT NOT NULL,
      job_id TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_job_id ON audit_logs (job_id)');
}

export async function writeAuditLog(input: {
  level?: AuditLevel;
  category: string;
  event: string;
  message: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const metadata = JSON.stringify(input.metadata ?? {});
  await db.execute({
    sql: 'INSERT INTO audit_logs (id, created_at, level, category, event, message, job_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [
      `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt,
      input.level ?? 'info',
      input.category,
      input.event,
      input.message.slice(0, 4000),
      input.jobId ?? '',
      metadata.slice(0, 12000),
    ],
  });
}

export async function listAuditLogs(options: {
  limit?: number;
  offset?: number;
  level?: string;
  category?: string;
  jobId?: string;
  query?: string;
} = {}): Promise<{ logs: AuditEvent[]; total: number }> {
  const db = getDb();
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (options.level) { where.push('level = ?'); args.push(options.level); }
  if (options.category) { where.push('category = ?'); args.push(options.category); }
  if (options.jobId) { where.push('job_id = ?'); args.push(options.jobId); }
  if (options.query?.trim()) {
    const q = `%${options.query.trim().slice(0, 200)}%`;
    where.push('(message LIKE ? OR event LIKE ? OR metadata LIKE ? OR job_id LIKE ?)');
    args.push(q, q, q, q);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await db.execute({ sql: `SELECT COUNT(*) AS count FROM audit_logs ${clause}`, args });
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 100)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const result = await db.execute({
    sql: `SELECT * FROM audit_logs ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });
  return { logs: result.rows as unknown as AuditEvent[], total: Number(count.rows[0]?.count ?? 0) };
}
