import { describe, expect, it, vi, afterEach } from "vitest";
import { mapMistralError } from "./mistral-client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mapMistralError", () => {
  it("maps statusCode 429 to rate_limited", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("Request failed"), { statusCode: 429 });
    const mapped = mapMistralError(err);
    expect(mapped.code).toBe("rate_limited");
    expect(mapped.httpStatus).toBe(429);
  });

  it("maps statusCode 503 to mistral_unavailable", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("boom"), { statusCode: 503 });
    const mapped = mapMistralError(err);
    expect(mapped.code).toBe("mistral_unavailable");
    expect(mapped.httpStatus).toBe(503);
  });

  it("maps 503 queue-full to mistral_unavailable and relays Retry-After", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(
      new Error("Streaming response failed: [503] The request queue is full."),
      {
        statusCode: 503,
        headers: new Headers({ "retry-after": "17" }),
      },
    );
    const mapped = mapMistralError(err);
    expect(mapped.code).toBe("mistral_unavailable");
    expect(mapped.httpStatus).toBe(503);
    expect(mapped.retryAfterSec).toBe(17);
  });

  it("keeps Retry-After undefined on a 503 without the header", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("boom"), { statusCode: 503 });
    const mapped = mapMistralError(err);
    expect(mapped.retryAfterSec).toBeUndefined();
  });

  it("keeps 400 as internal_error but logs the status", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(
      new Error("Assistant message must have either content or tool_calls"),
      { statusCode: 400 },
    );
    const mapped = mapMistralError(err);
    expect(mapped.code).toBe("internal_error");
    expect(log).toHaveBeenCalledWith(
      "[mistral]",
      400,
      expect.stringContaining("Assistant message"),
    );
  });

  it("re-throws AbortError without remapping", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(() => mapMistralError(err)).toThrow(err);
  });
});
