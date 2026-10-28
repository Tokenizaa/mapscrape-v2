import { beforeAll, describe, expect, it } from 'vitest';
import {
  initDb,
  resolveProject,
  listProjects,
  updateProject,
  deleteProject,
  resolveSearchCategory,
  listSearchCategories,
  updateSearchCategory,
  deleteSearchCategory,
  createJob,
  getJob,
} from '../src/server/db';
import { ScrapeJob } from '../src/shared/types';

describe('Projects and Categories CRUD & Isolation', () => {
  const userA = `user_a_${Date.now()}`;
  const userB = `user_b_${Date.now()}`;

  beforeAll(async () => {
    await initDb();
  });

  it('creates and lists projects scoped by consumer project', async () => {
    const projA = await resolveProject(userA, 'Prospecção SP', userA);
    expect(projA.id).toBeDefined();
    expect(projA.name).toBe('Prospecção SP');
    expect(projA.consumer_project).toBe(userA);

    // Idempotent creation
    const sameProjA = await resolveProject(userA, '  prospecção sp  ', userA);
    expect(sameProjA.id).toBe(projA.id);

    // Isolation: User B creates project with same name
    const projB = await resolveProject(userB, 'Prospecção SP', userB);
    expect(projB.id).not.toBe(projA.id);
    expect(projB.consumer_project).toBe(userB);

    const listA = await listProjects(userA, userA);
    expect(listA.some((p) => p.id === projA.id)).toBe(true);
    expect(listA.some((p) => p.id === projB.id)).toBe(false);
  });

  it('updates project name with validation and conflict prevention', async () => {
    const proj = await resolveProject(userA, 'Clínicas Odonto', userA);
    const updated = await updateProject(userA, proj.id, 'Clínicas Odonto Premium', userA);
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Clínicas Odonto Premium');

    // Attempting to rename to an existing project name in same scope throws conflict
    await resolveProject(userA, 'Outro Projeto', userA);
    await expect(updateProject(userA, proj.id, 'Outro Projeto', userA)).rejects.toThrow('project_name_conflict');

    // Non-existent or other user's project returns null
    const notFound = await updateProject(userB, proj.id, 'Tentativa Inválida', userB);
    expect(notFound).toBeNull();
  });

  it('deletes project and safely unlinks associated searches without losing jobs', async () => {
    const proj = await resolveProject(userA, 'Projeto Para Excluir', userA);
    const jobId = `job_del_test_${Date.now()}`;
    const job: ScrapeJob = {
      id: jobId,
      user_id: userA,
      project_id: proj.id,
      project_name: proj.name,
      segment: 'Teste Exclusão',
      location: 'Curitiba, PR',
      limit_requested: 5,
      status: 'completed',
      status_message: 'Concluído',
      total_found: 1,
      total_collected: 1,
      total_duplicates: 0,
      total_errors: 0,
      created_at: new Date().toISOString(),
    };
    await createJob(job);

    const deleted = await deleteProject(userA, proj.id, userA);
    expect(deleted).toBe(true);

    const list = await listProjects(userA, userA);
    expect(list.some((p) => p.id === proj.id)).toBe(false);

    // Job still exists in history, with project_id safely unlinked (null)
    const savedJob = await getJob(jobId, userA);
    expect(savedJob).not.toBeNull();
    expect(savedJob?.id).toBe(jobId);
    expect(savedJob?.project_id).toBeNull();
  });

  it('creates, lists, updates and deletes search categories with isolation', async () => {
    const catA = await resolveSearchCategory(userA, 'Cafeterias Artesanais', userA);
    expect(catA.id).toBeDefined();
    expect(catA.name).toBe('Cafeterias Artesanais');

    const catB = await resolveSearchCategory(userB, 'Cafeterias Artesanais', userB);
    expect(catB.id).not.toBe(catA.id);

    const updated = await updateSearchCategory(userA, catA.id, 'Cafés Especiais & Bistro', userA);
    expect(updated?.name).toBe('Cafés Especiais & Bistro');

    const listA = await listSearchCategories(userA, userA);
    expect(listA.some((c) => c.name === 'Cafés Especiais & Bistro')).toBe(true);
    expect(listA.some((c) => c.consumer_project === userB)).toBe(false);

    const deleted = await deleteSearchCategory(userA, catA.id, userA);
    expect(deleted).toBe(true);

    const listAAfter = await listSearchCategories(userA, userA);
    expect(listAAfter.some((c) => c.id === catA.id)).toBe(false);
  });
});
