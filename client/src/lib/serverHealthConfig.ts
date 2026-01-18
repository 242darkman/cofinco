const DEFAULT_HEALTH_ENDPOINT = '/api/health';
const DEFAULT_BACKOFF_DELAYS = [5000, 10000, 30000];
const DEFAULT_PING_INTERVAL_MS = 30000;
const DEFAULT_OFFLINE_THRESHOLD_MS = 60000;

const normalizeString = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

const parseBackoffDelays = (value: string | undefined): number[] => {
  if (!value) return DEFAULT_BACKOFF_DELAYS;
  const parsed = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((delay) => Number.isFinite(delay) && delay > 0);

  return parsed.length > 0 ? parsed : DEFAULT_BACKOFF_DELAYS;
};

export const SERVER_HEALTH_ENDPOINT =
  normalizeString(import.meta.env.VITE_HEALTH_ENDPOINT) ?? DEFAULT_HEALTH_ENDPOINT;

export const SERVER_HEALTH_BACKOFF_DELAYS = parseBackoffDelays(
  import.meta.env.VITE_HEALTH_BACKOFFS
);

export const SERVER_HEALTH_PING_INTERVAL_MS = parsePositiveNumber(
  import.meta.env.VITE_HEALTH_PING_INTERVAL_MS,
  DEFAULT_PING_INTERVAL_MS
);

export const SERVER_HEALTH_OFFLINE_THRESHOLD_MS = parsePositiveNumber(
  import.meta.env.VITE_HEALTH_OFFLINE_THRESHOLD_MS,
  DEFAULT_OFFLINE_THRESHOLD_MS
);
