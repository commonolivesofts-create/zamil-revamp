import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

const SPEC_PATH = join(import.meta.dirname, '../../docs/openapi/openapi.yaml');
const SPEC_ROUTE = '/api/openapi.json';

export function loadOpenApiSpec() {
  return parse(readFileSync(SPEC_PATH, 'utf8'));
}

export function createDocsRouter() {
  const spec = loadOpenApiSpec();
  const router = Router();

  router.get(SPEC_ROUTE, (_req, res) => res.json(spec));
  router.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(null, { swaggerOptions: { url: SPEC_ROUTE, validatorUrl: null } }),
  );

  return router;
}
