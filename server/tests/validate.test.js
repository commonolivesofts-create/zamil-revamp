import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import Joi from 'joi';
import request from 'supertest';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestId } from '../src/middleware/requestId.js';
import { validate } from '../src/middleware/validate.js';

const app = express();
app.use(requestId);
app.use(express.json());
app.post(
  '/items/:id',
  validate({
    params: Joi.object({ id: Joi.number().integer().positive().required() }),
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(25),
    }),
    body: Joi.object({
      code: Joi.string()
        .pattern(/^[A-Z]{3}$/)
        .required(),
    }),
  }),
  (req, res) => res.json({ params: req.params, query: req.query, body: req.body }),
);
app.use(errorHandler);

describe('validate middleware', () => {
  it('passes converted values and defaults to the handler', async () => {
    const res = await request(app).post('/items/7?limit=10').send({ code: 'ABC' }).expect(200);

    assert.deepEqual(res.body, {
      params: { id: 7 },
      query: { page: 1, limit: 10 },
      body: { code: 'ABC' },
    });
  });

  it('returns VALIDATION_ERROR with field details across all request parts', async () => {
    const res = await request(app).post('/items/abc?page=0').send({ code: 'ABC' }).expect(400);

    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(
      res.body.error.details.map((detail) => detail.field),
      ['id', 'page'],
    );
    assert.equal(res.body.meta.requestId, res.headers['x-request-id']);
  });

  it('rejects unknown properties to prevent mass assignment', async () => {
    const res = await request(app)
      .post('/items/1')
      .send({ code: 'ABC', role: 'ADMIN' })
      .expect(400);

    assert.deepEqual(res.body.error.details, [{ field: 'role', message: 'role is not allowed' }]);
  });

  it('never echoes rejected input values', async () => {
    const res = await request(app).post('/items/1').send({ code: 'secret-value' }).expect(400);

    assert.doesNotMatch(JSON.stringify(res.body), /secret-value/);
    assert.equal(res.body.error.details[0].message, 'code has an invalid format');
  });
});
