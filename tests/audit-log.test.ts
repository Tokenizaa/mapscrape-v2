import { beforeAll, describe, expect, it } from 'vitest';
import { initDb } from '../src/server/db';
import { initAuditLog, listAuditLogs, writeAuditLog } from '../src/server/audit-log';

describe('Structured audit log', () => {
  beforeAll(async () => {
    await initDb();
    await initAuditLog();
  });

  it('persists events and supports level/category/query filters', async () => {
    const marker = `audit-test-${Date.now()}`;
    await writeAuditLog({
      level: 'warn',
      category: 'test',
      event: marker,
      message: 'Diagnostic event for automated test',
      jobId: 'audit-test-job',
      metadata: { marker, attempt: 1 },
    });

    const result = await listAuditLogs({ level: 'warn', category: 'test', query: marker, limit: 10 });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.logs.some((entry) => entry.event === marker && entry.job_id === 'audit-test-job')).toBe(true);
    const entry = result.logs.find((item) => item.event === marker);
    expect(JSON.parse(entry?.metadata || '{}')).toMatchObject({ marker, attempt: 1 });
  });

  it('caps requested page size to prevent unbounded log queries', async () => {
    const result = await listAuditLogs({ limit: 100000 });
    expect(result.logs.length).toBeLessThanOrEqual(500);
  });
});
