import type { AxiosInstance, AxiosResponse } from 'axios';
import { http, isApiError as isApiErrorImpl, type ApiError } from '@/services/http';

/* ───────────────────────────────────────────────────────────────────────────
 * Client shim.
 *
 * This module used to host an in-browser mock adapter that answered requests
 * from a TypeScript simulator with artificial latency. That simulator is gone —
 * the platform runs on FastAPI and every figure the interface shows comes from
 * it.
 *
 * The real client is `services/http.ts`. This file re-exports it so the few
 * remaining consumers keep their import paths, and nothing here fabricates a
 * response.
 * ─────────────────────────────────────────────────────────────────────────── */

export type { ApiError };

export const api: AxiosInstance = http;

export const isApiError = isApiErrorImpl;

export const errorMessage = (value: unknown): string =>
  isApiError(value)
    ? value.detail
    : value instanceof Error
      ? value.message
      : 'An unexpected error occurred.';

/** Unwrap a response body. FastAPI returns the resource directly. */
export const unwrap = <T>(response: AxiosResponse<T>): T => response.data;
