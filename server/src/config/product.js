/**
 * Official product identity (owner decision, release V 2.1.0). The machine-readable version is
 * kept equal to package.json `version` (checked by tests/product-branding.test.js).
 *
 * Product branding only: the repository (`zamil-revamp`), package names, Oracle objects
 * (`XX_ZRV_*`), cookie names, environment variable names and the `/api/v1` routes keep their
 * established technical identifiers.
 */
export const PRODUCT = Object.freeze({
  name: 'Zamil Digitalization',
  version: '2.1.0',
});

/** User-facing release label, e.g. "V 2.1.0". */
export const displayVersion = (version = PRODUCT.version) => `V ${version}`;
