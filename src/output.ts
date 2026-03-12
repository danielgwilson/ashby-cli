function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export type CliError = {
  code: string;
  message: string;
  retryable: boolean;
  http?: { status: number };
  detail?: string;
};

export function toErrorCode(error: any): string {
  const status = error?.status as number | undefined;
  if (status === 400) return "VALIDATION";
  if (status === 401 || status === 403) return "AUTH_INVALID";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (typeof status === "number" && status >= 500) return "UPSTREAM_5XX";
  if (error?.name === "AbortError") return "TIMEOUT";
  return "UNKNOWN";
}

export function isRetryable(error: any): boolean {
  const code = toErrorCode(error);
  return code === "RATE_LIMITED" || code === "UPSTREAM_5XX" || code === "TIMEOUT";
}

export function makeError(error: any, { code, message }: { code?: string; message?: string } = {}): CliError {
  const status = error?.status as number | undefined;
  const data = error?.data as unknown;
  const resolvedCode = code || toErrorCode(error);
  const resolvedMessage = message || error?.message || "Request failed";

  const result: CliError = {
    code: resolvedCode,
    message: resolvedMessage,
    retryable: isRetryable(error),
  };

  if (typeof status === "number") result.http = { status };

  if (typeof data === "string" && data && data !== resolvedMessage) {
    result.detail = data.slice(0, 400);
  } else if (isObject(data)) {
    const detail = data.detail || data.error || data.message;
    if (detail && String(detail) !== resolvedMessage) result.detail = String(detail).slice(0, 400);
  }

  return result;
}

export type OkEnvelope<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type FailEnvelope = { ok: false; error: CliError; meta?: Record<string, unknown> };

export function ok<T>(data: T, meta?: Record<string, unknown>): OkEnvelope<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

export function fail(error: CliError, meta?: Record<string, unknown>): FailEnvelope {
  return meta ? { ok: false, error, meta } : { ok: false, error };
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

