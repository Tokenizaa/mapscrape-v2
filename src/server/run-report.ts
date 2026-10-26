import fs from 'node:fs/promises';
import path from 'node:path';
import { countPlaces, getAllPlaces, getJob } from './db';
import { listAuditLogs } from './audit-log';
import { PlaceRecord } from '../shared/types';

const reportDirectory = path.resolve(process.cwd(), 'artifacts', 'reports');

function missingFields(place: PlaceRecord): string[] {
  const fields: (keyof PlaceRecord)[] = [
    'name', 'category', 'address', 'phone', 'website', 'rating',
    'review_count', 'opening_hours', 'business_status', 'latitude',
    'longitude', 'maps_url',
  ];
  return fields.filter((field) => !String(place[field] ?? '').trim());
}

export async function writeRunReport(jobId: string, baselineCount: number, updateLatest = true): Promise<string> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Cannot write run report: job ${jobId} was not found`);

  const [currentCount, savedPlaces, audit] = await Promise.all([
    countPlaces(),
    getAllPlaces(jobId),
    listAuditLogs({ jobId, limit: 500 }),
  ]);

  const duplicateEvents = audit.logs
    .filter((event) => event.event === 'place.duplicate_skipped')
    .map((event) => {
      let metadata: Record<string, unknown> = {};
      try { metadata = JSON.parse(event.metadata || '{}'); } catch {}
      return { at: event.created_at, message: event.message, ...metadata };
    });

  const placeQuality = savedPlaces.map((place) => ({
    id: place.id,
    name: place.name,
    maps_url: place.maps_url,
    collected_at: place.collected_at,
    missing_fields: missingFields(place),
    populated_fields: Object.keys(place).filter((key) => String((place as unknown as Record<string, unknown>)[key] ?? '').trim()).length,
  }));

  const report = {
    schema_version: 1,
    report_type: 'mapscrape-run-audit',
    generated_at: new Date().toISOString(),
    application: 'Tokenizaa/mapscrape-v2',
    run: job,
    database: {
      total_before: baselineCount,
      total_after: currentCount,
      net_growth: currentCount - baselineCount,
      records_saved_by_run: savedPlaces.length,
      records_saved_by_run_matches_job_counter: savedPlaces.length === job.total_collected,
    },
    collection: {
      requested_limit: job.limit_requested,
      status: job.status,
      total_found: job.total_found,
      total_collected: job.total_collected,
      total_duplicates: job.total_duplicates,
      total_errors: job.total_errors,
      duplicate_only_run: job.total_collected === 0 && job.total_duplicates > 0,
      reached_successful_new_record_target: job.total_collected >= job.limit_requested,
    },
    data_quality: {
      records_with_missing_fields: placeQuality.filter((place) => place.missing_fields.length > 0).length,
      missing_field_frequency: Object.fromEntries(
        [...new Set(placeQuality.flatMap((place) => place.missing_fields))]
          .map((field) => [field, placeQuality.filter((place) => place.missing_fields.includes(field)).length])
      ),
      saved_records: placeQuality,
    },
    duplicates: duplicateEvents,
    audit: {
      returned_count: audit.logs.length,
      total_matching_events: audit.total,
      events: audit.logs,
      truncated: audit.total > audit.logs.length,
    },
    interpretation: {
      database_growth_is_measured_by_before_after_count: true,
      zero_growth_is_not_reported_as_new_data: currentCount - baselineCount === 0,
      note: 'O relatório descreve evidências locais observadas. Crescimento líquido e contagem por job são métricas distintas; não comprovam que o Google Maps tenha retornado todos os resultados possíveis.',
    },
  };

  await fs.mkdir(reportDirectory, { recursive: true });
  const filePath = path.join(reportDirectory, `${jobId}.json`);
  await fs.writeFile(filePath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (updateLatest) await fs.writeFile(path.join(reportDirectory, 'latest-audit.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  return filePath;
}

export async function readRunReport(jobId: string): Promise<unknown | null> {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(jobId)) return null;
  try {
    const content = await fs.readFile(path.join(reportDirectory, `${jobId}.json`), 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
