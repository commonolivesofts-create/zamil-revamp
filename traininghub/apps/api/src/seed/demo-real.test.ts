import { expect, it } from 'vitest';
import { MemoryStore } from '../db/memory';
import { DEMO_PEOPLE, seedMaster } from './seed';
import { addDemoData, hasDemoData, removeDemoData } from './demo-real';

it('adds and removes demo data on a real-looking directory', async () => {
  const store = new MemoryStore(null);
  await seedMaster(store, { approveProfiles: true });
  // Real job titles that match no position.
  for (const p of DEMO_PEOPLE)
    await store.insert('employees', {
      personId: p.personId,
      personNumber: p.personNumber,
      fullName: p.fullName,
      jobName: `Job ${p.personId}`,
      supervisorPersonId: p.supervisorPersonId,
      activeFlag: true,
    });
  const log = await addDemoData(store, { bootstrap: ['2172'] });
  expect(log.join(' ')).toMatch(/mapped \d+ employees/);
  expect(await hasDemoData(store)).toBe(true);
  expect(await store.count('requests')).toBeGreaterThan(10);
  expect((await store.find('sessions')).every((s) => s.skillId > 0)).toBe(true);
  const names = new Set((await store.find('skills')).map((s) => s.id));
  expect(new Set((await store.find('sessions')).map((s) => s.skillId)).size).toBe(12);
  expect(
    [...new Set((await store.find('sessions')).map((s) => s.skillId))].every((id) => names.has(id)),
  ).toBe(true);
  await removeDemoData(store);
  expect(await store.count('requests')).toBe(0);
  expect(await store.count('sessions')).toBe(0);
  expect(await store.count('employeeExt')).toBe(0);
  expect(await store.count('employeeSkills')).toBe(0);
});
