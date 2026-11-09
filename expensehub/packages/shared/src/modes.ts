// Implements: D-33 run modes (TRD §10).

export const DATA_MODES = ['memory', 'oracle'] as const;
export type DataMode = (typeof DATA_MODES)[number];

export const FUSION_MODES = ['mock', 'live'] as const;
export type FusionMode = (typeof FUSION_MODES)[number];

export const NOTIFY_TRANSPORTS = ['outbox', 'smtp'] as const;
export type NotifyTransport = (typeof NOTIFY_TRANSPORTS)[number];

export const APP_ENVS = ['development', 'test', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Header required on every mutating request (TRD §5 CSRF). */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'ExpenseHub';
