/**
 * Shared HTTP client. No auth — the Control Plane is localhost-only.
 * Throws on non-2xx responses; repositories are responsible for catching
 * and translating into Result at the application layer.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, statusText: string, path: string) {
    super(`HTTP ${status} ${statusText} on ${path}`);
    this.name = 'HttpError';
    this.status = status;
    this.path = path;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, path);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const httpClient = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
};

/** Builds a `?a=b&c=d` query string, dropping null/undefined/empty values. */
export function buildQueryString(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
