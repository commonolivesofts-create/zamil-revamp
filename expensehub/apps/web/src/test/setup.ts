import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '../lib/i18n';

// React Router's data router builds a Request on every navigation; Node's Request rejects
// jsdom's AbortSignal. Tests don't need the signal, so drop it.
const NodeRequest = globalThis.Request;
class TestRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal: _signal, ...rest } = init ?? {};
    super(input, rest);
  }
}
globalThis.Request = TestRequest as typeof Request;

afterEach(() => {
  cleanup();
});
