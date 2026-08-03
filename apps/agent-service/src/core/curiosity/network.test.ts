import { describe, expect, it, vi } from "vitest";
import { fetchValidatedResource, isPublicAddress, validatePublicUrl } from "./network.js";

describe("curiosity network boundary", () => {
  it("rejects private, loopback, link-local, reserved, and metadata addresses", async () => {
    for (const address of [
      "127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1",
      "198.51.100.1", "::1", "fe80::1", "fc00::1", "2001:db8::1",
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
    await expect(validatePublicUrl("http://internal.test/x", async () => [
      { address: "10.1.2.3", family: 4 },
    ])).rejects.toThrow("non_public_address");
  });

  it("revalidates every redirect before fetching it", async () => {
    const fetcher = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    }));
    await expect(fetchValidatedResource("https://public.test/start", {
      accept: "text/html",
      fetcher,
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    })).rejects.toThrow("non_public_address");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("enforces the two-megabyte response boundary", async () => {
    await expect(fetchValidatedResource("https://public.test/large", {
      accept: "text/html",
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      fetcher: async () => new Response("small", {
        status: 200,
        headers: { "content-length": String(2 * 1024 * 1024 + 1) },
      }),
    })).rejects.toThrow("response_too_large");
  });
});
