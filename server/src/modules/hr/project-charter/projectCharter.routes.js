import { Router } from 'express';

import { createRequireCsrfToken } from '../../../middleware/csrf.js';
import { validate } from '../../../middleware/validate.js';

import { createProjectCharterController } from './projectCharter.controller.js';

import {
  charterParams,
  ideaParams,
  employeeParams,
  empty,
  listQuery,
  employeesQuery,
  createBody,
  updateBody,
  rewardBody,
} from './projectCharter.validation.js';

// Must exist in the Oracle RBAC permission catalog.
const RESOURCE = 'PROJECT_CHARTERS.PROJECT_CHARTERS';

export function createProjectCharterRouter({
  projectCharterService,
  authenticate,
  authorize,
  auditService,
}) {
  const r = Router();

  const c = createProjectCharterController({
    projectCharterService,
  });

  const csrf = createRequireCsrfToken({
    auditService,
  });

  const read = (schema = {}) => [
    authenticate,
    authorize(RESOURCE, 'VIEW'),
    validate({
      query: empty,
      ...schema,
    }),
  ];

  const write = (action, schema = {}) => [
    authenticate,
    csrf,
    authorize(RESOURCE, action),
    validate({
      query: empty,
      ...schema,
    }),
  ];

  r.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Main Project Charter APIs
  r.get('/', ...read({ query: listQuery }), c.list);

  r.post('/', ...write('CREATE', { body: createBody }), c.create);

  // Idea lookup
  r.get('/lookups/ideas', ...read(), c.ideas);

  r.get('/lookups/ideas/:ideaId', ...read({ params: ideaParams }), c.idea);

  // Employee lookup
  r.get('/lookups/employees', ...read({ query: employeesQuery }), c.employees);

  r.get('/lookups/employees/:empNo', ...read({ params: employeeParams }), c.employee);

  // Charter details
  r.get('/:headerId', ...read({ params: charterParams }), c.get);

  r.put(
    '/:headerId',
    ...write('UPDATE', {
      params: charterParams,
      body: updateBody,
    }),
    c.update,
  );

  r.delete(
    '/:headerId',
    ...write('DELETE', {
      params: charterParams,
      body: empty,
    }),
    c.remove,
  );

  // Idea Reward
  r.get('/:headerId/reward', ...read({ params: charterParams }), c.reward);

  r.put(
    '/:headerId/reward',
    ...write('UPDATE', {
      params: charterParams,
      body: rewardBody,
    }),
    c.updateReward,
  );

  return r;
}
