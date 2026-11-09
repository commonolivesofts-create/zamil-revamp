// npm run data:reset — D-33 memory mode.
// Deletes the memory-store snapshot so the next API start reloads the seed data.
// Refuses to run when NODE_ENV=production.
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (process.env.NODE_ENV === 'production') {
  console.error('[data:reset] Refused: NODE_ENV=production.');
  process.exit(1);
}

const dataFile = path.resolve(root, process.env.DATA_FILE ?? './storage/dev-data.json');

if (existsSync(dataFile)) {
  rmSync(dataFile);
  console.log(`[data:reset] Deleted ${path.relative(root, dataFile)}.`);
} else {
  console.log(`[data:reset] Nothing to delete (${path.relative(root, dataFile)} not found).`);
}
// The mock Fusion invoices (D-36) belong to the deleted reports too.
const mockFusion = path.resolve(
  root,
  process.env.FUSION_MOCK_STATE ?? './storage/mock-fusion.json',
);
if (process.env.FUSION_MOCK_STATE !== '' && existsSync(mockFusion)) {
  rmSync(mockFusion);
  console.log(`[data:reset] Deleted ${path.relative(root, mockFusion)}.`);
}

// Receipt files belong to the deleted rows; leaving them would orphan them.
const receiptsDir = path.resolve(root, process.env.RECEIPTS_DIR ?? './storage/receipts');
if (existsSync(receiptsDir)) {
  rmSync(receiptsDir, { recursive: true, force: true });
  console.log(`[data:reset] Deleted ${path.relative(root, receiptsDir)}/.`);
}
console.log('[data:reset] Seed data loads on the next API start (npm run dev).');
