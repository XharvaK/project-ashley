export type ErrorCode =
  | "message_required"
  | "invalid_channel"
  | "invalid_json"
  | "forbidden"
  | "chat_in_progress"
  | "message_too_long"
  | "rate_limited"
  | "mistral_unavailable"
  | "agent_not_ready"
  | "initiative_skipped"
  | "internal_error";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly retryAfterSec?: number;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    retryAfterSec?: number,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfterSec = retryAfterSec;
  }
}

export function toErrorResponse(err: unknown): {
  status: number;
  body: { error: string; code: string; retryAfterSec?: number };
} {
  if (err instanceof AppError) {
    return {
      status: err.httpStatus,
      body: {
        error: err.message,
        code: err.code,
        ...(err.retryAfterSec !== undefined
          ? { retryAfterSec: err.retryAfterSec }
          : {}),
      },
    };
  }
  console.error("[agent-service] unhandled:", err);
  return {
    status: 500,
    body: { error: "Internal server error", code: "internal_error" },
  };
}
