// Project Charter create (database identity HEADER_ID) and list paging, and the
// survey distribution chart rule (legacy: a dimension set to "All" is chosen).
// Mocked repositories; no Oracle.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createProjectCharterService } from '../src/modules/hr/project-charter/projectCharter.service.js';
import { createSurveyReportService } from '../src/modules/hr/surveyReport/surveyReport.service.js';

const run = async (_pool, fn) => fn({});

const PAYLOAD = {
  ideaId: '77',
  projectManager: 'Test Manager',
  expectedStartDate: '2026-12-01',
  expectedEndDate: '2027-03-31',
  purpose: 'Purpose',
  expectedDeliverables: 'Deliverables',
};

function charterFixture({ approved = true } = {}) {
  const calls = [];
  const repository = {
    findApprovedIdea: async (_c, id) =>
      approved ? { ideaId: id, ideaNum: 'ID-1', title: 'Idea', businessUnit: 'BU' } : null,
    insertCharterUsingIdentity: async (_c, payload, idea) => {
      calls.push({ payload, idea });
      return '501';
    },
    findCharter: async (_c, id) => ({ headerId: String(id), status: 'Pending' }),
    listCharters: async (_c, query) => {
      calls.push({ query });
      return { total: 3, items: [] };
    },
  };
  return {
    calls,
    service: createProjectCharterService({ repository, withConnection: run, withTransaction: run }),
  };
}

describe('Project Charter service', () => {
  it('creates through the identity insert for an approved idea and returns the stored charter', async () => {
    const { calls, service } = charterFixture();
    const created = await service.create({}, PAYLOAD);
    assert.deepEqual(created, { headerId: '501', status: 'Pending' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].idea.ideaId, '77');
  });

  it('refuses an unapproved idea and inverted dates without inserting', async () => {
    const unapproved = charterFixture({ approved: false });
    await assert.rejects(unapproved.service.create({}, PAYLOAD), { statusCode: 400 });
    assert.equal(unapproved.calls.length, 0);

    const inverted = charterFixture();
    await assert.rejects(
      inverted.service.create({}, { ...PAYLOAD, expectedEndDate: '2026-11-30' }),
      { statusCode: 400 },
    );
    assert.equal(inverted.calls.length, 0);
  });

  it('lists with page and pageSize in the result', async () => {
    const { calls, service } = charterFixture();
    assert.deepEqual(await service.list({}, { page: 2, pageSize: 10 }), {
      total: 3,
      items: [],
      page: 2,
      pageSize: 10,
    });
    assert.deepEqual(await service.list({}, {}), { total: 3, items: [], page: 1, pageSize: 25 });
    assert.equal(calls.at(-1).query.page, 1);
  });
});

describe('Survey distribution charts', () => {
  const rows = [
    { BUCKET: 'Agree', CNT: 3, LINE_ID: 1, G: '20-29' },
    { BUCKET: 'Disagree', CNT: 1, LINE_ID: 1, G: '30-39' },
  ];
  const service = () => {
    const groups = [];
    const repository = {
      counts: async (_c, { group }) => {
        groups.push(group ?? 'none');
        return rows;
      },
      catalogueTexts: async () => [{ LINE_ID: 1, QUESTION: 'Question one' }],
    };
    return {
      groups,
      service: createSurveyReportService({ repository, withConnection: run, withTransaction: run }),
    };
  };

  it('charts a dimension set to "All" (legacy) and leaves an unset one empty', async () => {
    const { groups, service: s } = service();
    const result = await s.distribution({
      question_key: 'relation_1',
      age: '__ALL__',
      job_level: '',
    });
    assert.equal(result.charts.age.selected, true);
    assert.deepEqual(result.charts.age.data.categories, ['20-29', '30-39']);
    assert.equal(result.charts.job.selected, false);
    assert.deepEqual(result.charts.job.data, { categories: [], series: [] });
    assert.deepEqual(groups, ['none', 'age']);
  });
});
