import { randomUUID } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultRead,
  withTransaction as defaultWrite,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import * as repositoryDefault from './surveyReport.repository.js';

import { QUESTIONS, SECTIONS, DEMOGRAPHICS, ANSWERS } from './surveyReport.validation.js';

const BUCKETS = ['Strongly Agree', 'Agree', 'Disagree', 'Strongly Disagree'];

const SCORE_FIELDS = ['stronglyAgree', 'agree', 'disagree', 'stronglyDisagree'];

const findQuestion = (key) => QUESTIONS.find((question) => question.key === key);

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

function getWeights(slot) {
  return [19, 20].includes(Number(slot)) ? [1, 2, 4, 5] : [5, 4, 2, 1];
}

function mapHeader(row) {
  return {
    headerId: Number(row.HEADER_ID),
    ageBand: row.AGE_BAND,
    jobLevel: row.JOB_LEVEL,
    department: row.DEPARTMENT,
    experience: row.EXPERIENCE,
    submittedAt: row.SUBMITTED_AT,
    year: Number(row.YEAR),
  };
}

function summarize(rows) {
  const counts = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]));

  let total = 0;
  let weighted = 0;

  for (const row of rows) {
    const bucketIndex = BUCKETS.indexOf(row.BUCKET);

    if (bucketIndex < 0) {
      continue;
    }

    const count = Number(row.CNT);

    counts[row.BUCKET] += count;
    total += count;

    weighted += count * getWeights(row.LINE_ID)[bucketIndex];
  }

  const result = {};

  for (let index = 0; index < BUCKETS.length; index++) {
    const bucket = BUCKETS[index];
    const field = SCORE_FIELDS[index];

    result[field] = total ? round((counts[bucket] / total) * 100) : 0;

    result[`${field}Count`] = counts[bucket];
  }

  result.totalCount = total;
  result.responses = total;

  result.weightedScore = total ? round(weighted / total) : null;

  result.weightedPercent = total ? round((weighted / total / 5) * 100) : null;

  return result;
}

function buildChart(rows) {
  const groups = Object.groupBy(rows, (row) => String(row.G));

  const categories = Object.keys(groups);

  return {
    categories,

    series: BUCKETS.map((bucket, index) => ({
      name: bucket,

      data: categories.map((category) => {
        const summary = summarize(groups[category]);

        return summary.totalCount ? summary[SCORE_FIELDS[index]] : 0;
      }),
    })),
  };
}

export function createSurveyReportService({
  repository = repositoryDefault,
  withConnection = defaultRead,
  withTransaction = defaultWrite,
} = {}) {
  const read = (callback) => withConnection(POOLS.LOW, callback);

  const transaction = (callback) => withTransaction(POOLS.LOW, callback);

  async function catalogue() {
    const texts = await read((connection) => repository.catalogueTexts(connection));

    return QUESTIONS.map((question) => {
      const matching = texts.filter((row) => Number(row.LINE_ID) === question.slot);

      const english = matching.find((row) => !/[ء-ي]/.test(row.QUESTION || ''));

      const arabic = matching.find((row) => /[ء-ي]/.test(row.QUESTION || ''));

      return {
        ...question,

        text: {
          en: english?.QUESTION ?? null,
          ar: arabic?.QUESTION ?? null,
        },
      };
    });
  }

  function requireQuestionTexts(questions, language) {
    const missing = questions.some((question) => !question.text[language]);

    if (missing) {
      throw new AppError(
        503,
        'SURVEY_CATALOGUE_UNAVAILABLE',
        'Canonical survey question text is unavailable for this language',
      );
    }
  }

  async function meta() {
    return {
      demographics: DEMOGRAPHICS,

      sections: SECTIONS.map(([key, , code, en, ar]) => ({
        key,
        code,
        title: { en, ar },
      })),

      questions: await catalogue(),

      answers: ANSWERS,
    };
  }

  async function questions() {
    const items = await catalogue();

    return items.map((question) => ({
      question_key: question.key,

      section_en: question.title.en,
      section_ar: question.title.ar,

      question_en: question.text.en,
      question_ar: question.text.ar,
    }));
  }

  async function create(body, ip) {
    const questions = await catalogue();

    requireQuestionTexts(questions, body.language);

    return transaction(async (connection) => {
      const headerId = await repository.createHeader(connection, {
        uuid: randomUUID(),

        ...body.demographics,

        ip: ip ?? null,
      });

      for (const question of questions) {
        await repository.createLine(connection, {
          headerId,

          slot: question.slot,

          section: question.title[body.language],

          question: question.text[body.language],

          answer: body.answers[question.key],

          remark: body.remarks?.[question.key] || null,

          code: question.code,
        });
      }

      return {
        headerId: Number(headerId),
        lineCount: 29,
      };
    });
  }

  async function list(filters) {
    const result = await read((connection) => repository.list(connection, filters));

    return {
      items: result.rows.map((row) => ({
        ...mapHeader(row),
        lineCount: Number(row.LINE_COUNT),
      })),

      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async function get(headerId) {
    const header = await read((connection) => repository.header(connection, headerId));

    if (!header) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Survey response not found');
    }

    const questions = await catalogue();

    const lines = await read((connection) => repository.lines(connection, headerId));

    const sections = SECTIONS.map(([key, , code, en, ar]) => {
      const answers = lines
        .map((line) => {
          const question = questions.find((item) => item.slot === Number(line.LINE_ID));

          if (!question || question.section !== key) {
            return null;
          }

          return {
            questionKey: question.key,
            slot: Number(line.LINE_ID),

            text: question.text,

            answer: line.ANSWER,
            remark: line.REMARK,
          };
        })
        .filter(Boolean);

      return {
        key,
        code,
        title: { en, ar },
        answers,
      };
    });

    return {
      ...mapHeader(header),
      sections,
    };
  }

  async function remove(headerId) {
    return transaction(async (connection) => {
      const counts = await repository.remove(connection, headerId);

      if (!counts.headers) {
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Survey response not found');
      }

      return counts;
    });
  }

  function cleanLovs(data) {
    return {
      ...data,

      ages: data.ages.filter((value) => DEMOGRAPHICS.age.includes(value)),

      jobs: data.jobs.filter((value) => DEMOGRAPHICS.jobLevel.includes(value)),

      departments: data.departments.filter((value) => DEMOGRAPHICS.department.includes(value)),

      experiences: data.experiences.filter((value) => DEMOGRAPHICS.experience.includes(value)),
    };
  }

  async function filters() {
    const data = await read((connection) => repository.filterLovs(connection));

    return cleanLovs(data);
  }

  async function questionFilters(questionKey) {
    const question = findQuestion(questionKey);

    const data = await read((connection) => repository.filterLovs(connection, question.slot));

    return cleanLovs(data);
  }

  async function distribution({ question_key, ...filters }) {
    const question = findQuestion(question_key);

    const rows = await read((connection) =>
      repository.counts(connection, {
        slots: [question.slot],
        filters,
      }),
    );

    const score = summarize(rows);
    const hasData = score.totalCount > 0;

    const charts = {};

    const chartDefinitions = [
      ['age', 'age', 'Age Level'],
      ['job', 'job_level', 'Job Level'],
      ['department', 'department', 'Departments Level'],
      ['experience', 'experience', 'Experience Level'],
    ];

    for (const [name, field, title] of chartDefinitions) {
      const selected = Boolean(filters[field]) && filters[field] !== '__ALL__';

      charts[name] = {
        selected,
        title,

        data: {
          categories: [],
          series: [],
        },
      };

      if (selected && hasData) {
        const chartRows = await read((connection) =>
          repository.counts(connection, {
            slots: [question.slot],
            filters,
            group: name,
          }),
        );

        charts[name].data = buildChart(chartRows);
      }
    }

    const catalogueItems = await catalogue();

    const selectedQuestion = catalogueItems.find((item) => item.key === question.key);

    return {
      has_data: hasData,

      question: {
        key: question.key,
        en: selectedQuestion.text.en,
        ar: selectedQuestion.text.ar,
      },

      scoreSummary: {
        ...score,

        scoringDirection: [19, 20].includes(question.slot) ? 'reverse' : 'standard',
      },

      charts,

      ...(!hasData
        ? {
            message: 'No survey response found for the selected filter combination.',
          }
        : {}),
    };
  }

  async function categoryScore({ category_key, ...filters }) {
    const section = SECTIONS.find((item) => item[0] === category_key);

    const slots = QUESTIONS.filter((question) => question.section === category_key).map(
      (question) => question.slot,
    );

    const rows = await read((connection) =>
      repository.counts(connection, {
        slots,
        filters,
      }),
    );

    const score = summarize(rows);

    return {
      has_data: score.totalCount > 0,

      categoryKey: category_key,

      section: {
        en: section[3],
        ar: section[4],
      },

      questionCount: slots.length,

      scoreSummary: score,
    };
  }

  async function yearwise({ question_key, years }) {
    const question = findQuestion(question_key);

    const rows = await read((connection) =>
      repository.counts(connection, {
        slots: [question.slot],
        years,
        group: 'year',
      }),
    );

    const catalogueItems = await catalogue();

    const selectedQuestion = catalogueItems.find((item) => item.key === question_key);

    return {
      has_data: rows.length > 0,

      question: {
        key: question.key,
        en: selectedQuestion.text.en,
        ar: selectedQuestion.text.ar,
      },

      chart: buildChart(rows),
    };
  }

  async function categoryDepartment(filters) {
    const rows = await read((connection) =>
      repository.counts(connection, {
        slots: QUESTIONS.map((question) => question.slot),

        filters: {
          ...filters,
          year: filters.year,
        },

        group: 'department',
      }),
    );

    const categories = SECTIONS.map(([key, , , en, ar]) => {
      const categoryRows = rows.filter((row) => {
        const question = QUESTIONS.find((item) => item.slot === Number(row.LINE_ID));

        return question?.section === key;
      });

      const departments = Object.groupBy(categoryRows, (row) => String(row.G));

      return {
        categoryKey: key,

        section: { en, ar },

        questionCount: QUESTIONS.filter((question) => question.section === key).length,

        departments: Object.entries(departments).map(([department, records]) => ({
          department,
          ...summarize(records),
        })),

        total: {
          department: 'All Departments / Total',
          ...summarize(categoryRows),
        },
      };
    });

    const selectedYear =
      filters.year && filters.year !== '__ALL__' ? String(filters.year) : 'All Years';

    return {
      has_data: rows.length > 0,

      selectedYear,

      categories,

      overallSummary: {
        department: 'All Categories / Total',

        ...summarize(rows),

        categoryCount: SECTIONS.length,

        selectedYear,
      },
    };
  }

  return {
    meta,
    questions,
    create,
    list,
    get,
    remove,
    filters,
    questionFilters,
    distribution,
    categoryScore,
    yearwise,
    categoryDepartment,
  };
}
