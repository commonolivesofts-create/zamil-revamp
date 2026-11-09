// npm run db:smoke — round-trips every column type through the Oracle store inside a transaction
// that is rolled back, so nothing is left behind.
import { main, oracleFromEnv } from './cli';

class Rollback extends Error {}

void main(async () => {
  const { store } = oracleFromEnv();
  const checks: string[] = [];
  try {
    await store.tx(async () => {
      const at = new Date().toISOString();
      const cat = await store.insert('categories', { code: 'ZZ_SMOKE', name: 'Smoke test', colorIndex: 1, sortOrder: 999 });
      checks.push(`identity insert → id ${cat.id}`);
      const sk = await store.insert('skills', { code: 'ZZ_SMOKE_SKILL', name: 'Smoke skill', categoryId: cat.id, activeFlag: true, createdAt: at });
      const s = await store.insert('sessions', {
        title: 'Smoke session', skillId: sk.id, sessionType: 'INTERNAL', startDate: '2030-01-02', endDate: '2030-01-03',
        startTime: '09:00', endTime: '12:00', capacity: 5, bandFrom: 0, bandTo: 2, costHalalas: 123456, deliveryMode: 'ONLINE',
        statusCode: 'SCHEDULED', createdAt: at, updatedAt: at,
      });
      if (s.startDate !== '2030-01-02' || s.createdAt !== at || s.costHalalas !== 123456) throw new Error(`date/timestamp/number round trip failed: ${JSON.stringify(s)}`);
      checks.push('DATE, TIMESTAMP and NUMBER round trip');
      await store.upsert('settings', ['settingKey'], { settingKey: 'ZZ_SMOKE', settingValue: 'a', updatedAt: at });
      await store.upsert('settings', ['settingKey'], { settingKey: 'ZZ_SMOKE', settingValue: 'b', updatedAt: at });
      if ((await store.one('settings', { settingKey: 'ZZ_SMOKE' }))?.settingValue !== 'b') throw new Error('MERGE upsert failed');
      checks.push('MERGE upsert');
      const n = await store.count('skills', { id: [sk.id, -1], activeFlag: true });
      if (n !== 1) throw new Error('IN list / flag filter failed');
      checks.push('IN list and Y/N flag filter');
      const list = await store.find('sessions', { skillId: sk.id }, { orderBy: ['-startDate'], limit: 1 });
      if (list.length !== 1) throw new Error('ORDER BY / FETCH FIRST failed');
      checks.push('ORDER BY + FETCH FIRST');
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  const left = await store.count('categories', { code: 'ZZ_SMOKE' });
  if (left) throw new Error('Rollback failed — smoke rows remain');
  checks.push('transaction rollback');
  checks.forEach((c) => console.log(`✔ ${c}`));
  await store.close();
});
