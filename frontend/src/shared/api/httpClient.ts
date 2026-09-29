import { env } from '../../config/env';
import { ApiError } from './ApiError';
import type { ApiErrorBody } from './types';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  accessToken?: string;
  body?: unknown;
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: ApiErrorBody | null = null;
  try {
    payload = (await response.json()) as ApiErrorBody;
  } catch {
    // The fallback below keeps network/proxy errors readable.
  }

  return new ApiError(
    payload?.error.code ?? 'INTERNAL_ERROR',
    payload?.error.message ?? 'Не удалось выполнить запрос',
    response.status,
    payload?.error.details,
  );
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, body, headers, ...init } = options;
  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function requestBlob(
  path: string,
  options: RequestOptions = {},
): Promise<Blob> {
  const { accessToken, body, headers, ...init } = options;
  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) throw await parseError(response);
  return response.blob();
}
