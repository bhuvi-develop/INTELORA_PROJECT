import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { env } from '@/config/env';

/* ───────────────────────────────────────────────────────────────────────────
 * The single HTTP client.
 *
 * One axios instance for the whole application, pointed at the FastAPI service.
 * No component builds a request of its own: every call goes through a service in
 * this folder, which is what keeps the endpoint list in one place and lets the
 * base URL, timeout and error shape change without touching a page.
 *
 * Errors are normalised here. A network failure, a timeout, a 500 and an aborted
 * request all reach the interface as the same object, so error handling upstream
 * is one branch rather than four.
 * ─────────────────────────────────────────────────────────────────────────── */

export type ApiErrorKind = 'offline' | 'timeout' | 'cancelled' | 'server' | 'client' | 'unknown';

export interface ApiError {
  kind: ApiErrorKind;
  status: number;
  message: string;
  /** Operator-facing sentence, safe to render directly. */
  detail: string;
  path?: string;
}

export const isApiError = (value: unknown): value is ApiError =>
  typeof value === 'object' && value !== null && 'kind' in value && 'detail' in value;

const MESSAGES: Record<ApiErrorKind, string> = {
  offline:
    'The INTELORA backend is not reachable. Start the service on ' +
    `${env.apiBaseUrl.replace(/\/api\/?$/, '')} and this view will reconnect automatically.`,
  timeout: 'The backend did not respond in time. It may be busy generating history — retrying shortly.',
  cancelled: 'Request cancelled.',
  server: 'The backend returned an error while producing this view.',
  client: 'The backend rejected this request.',
  unknown: 'An unexpected problem occurred while contacting the backend.',
};

const classify = (error: AxiosError): ApiErrorKind => {
  if (axios.isCancel(error) || error.code === 'ERR_CANCELED') return 'cancelled';
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'timeout';
  if (!error.response) return 'offline';
  if (error.response.status >= 500) return 'server';
  if (error.response.status >= 400) return 'client';
  return 'unknown';
};

const toApiError = (error: AxiosError): ApiError => {
  const kind = classify(error);
  const status = error.response?.status ?? 0;

  // FastAPI reports failures as { detail: string } or { detail: [...] }.
  const payload = error.response?.data as { detail?: unknown } | undefined;
  const serverDetail =
    typeof payload?.detail === 'string' && payload.detail.trim().length > 0 ? payload.detail : undefined;

  return {
    kind,
    status,
    message: error.message,
    detail: serverDetail ?? MESSAGES[kind],
    path: error.config?.url,
  };
};

export const http: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.requestTimeoutMs,
  headers: { Accept: 'application/json' },
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(toApiError(error)),
);

/**
 * Typed GET.
 *
 * `signal` is threaded through so a caller — React Query, or a component
 * unmounting mid-flight — can abort the request rather than letting a response
 * arrive for a view that no longer exists.
 */
export const get = async <T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response = await http.get<T>(url, { params, ...config });
  return response.data;
};

export const post = async <T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response = await http.post<T>(url, body, config);
  return response.data;
};

export const del = async <T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response = await http.delete<T>(url, config);
  return response.data;
};

/** Base origin of the backend, without the API prefix — used by the websocket. */
export const backendOrigin = (): string => env.apiBaseUrl.replace(/\/api\/?$/, '');
