import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { countPlaces, createJob, insertPlace, initDb, updateJobProgress } from '../src/server/db';
import { readRunReport, writeRunReport } from '../src/server/run-report';
import { ScrapeJob, PlaceRecord } from '../src/shared/types';

describe('Per-run evidence report', () => {
  beforeAll(async () => { await initDb(); });

  it('records before/after database counts and saved record quality', async () => {
    const id = `report_test_${Date.now()}`;
    const baseline = await countPlaces();
    const job: ScrapeJob = {
      id,
      segment: 'Teste automatizado',
      location: 'Cidade de teste',
      limit_requested: 1,
      status: 'running',
      status_message: 'Teste',
      total_found: 1,
      total_collected: 1,
      total_duplicates: 0,
      total_errors: 0,
      created_at: new Date().toISOString(),
    };
    await createJob(job);
    const place: PlaceRecord = {
      id: `place_${id}`,
      job_id: id,
      name: 'Estabelecimento de teste',
      category: 'Teste',
      address: '',
      phone: '',
      website: '',
      rating: '',
      review_count: '',
      price_range: '',
      opening_hours: '',
      business_status: '',
      latitude: '',
      longitude: '',
      maps_url: `https://www.google.com/maps/place/${id}`,
      description: '',
      services_attributes: '',
      collected_at: new Date().toISOString(),
    };
    await insertPlace(place);
    await updateJobProgress(id, { status: 'completed', completed_at: new Date().toISOString() });

    const reportPath = await writeRunReport(id, baseline, { updateLatest: false, generatePdf: false });
    expect(reportPath).toContain(`${id}.json`);
    const report = await readRunReport(id) as any;
    expect(report).not.toBeNull();
    expect(report.run.id).toBe(id);
    expect(report.database.total_after).toBeGreaterThanOrEqual(report.database.total_before + 1);
    expect(report.database.records_saved_by_run).toBe(1);
    expect(report.data_quality.saved_records[0].missing_fields).toContain('address');
    await fs.unlink(reportPath);
  });
});
