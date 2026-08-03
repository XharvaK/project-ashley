import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_REDIRECTS = 5;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 20_000;

export type ResolveHost = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;
export type FetchLike = typeof fetch;

function publicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return publicIpv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase().split("%")[0]!;
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  ) return false;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? publicIpv4(mapped[1]!) : true;
}

const defaultResolve: ResolveHost = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family }));
};

export async function validatePublicUrl(
  input: string,
  resolve: ResolveHost = defaultResolve,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("invalid_url");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("unsupported_url");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await resolve(hostname);
  if (addresses.length === 0 || addresses.some((record) => !isPublicAddress(record.address))) {
    throw new Error("non_public_address");
  }
  return url;
}

async function boundedBody(response: Response): Promise<Uint8Array> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("response_too_large");
    }
    chunks.push(part.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function fetchValidatedResource(
  input: string,
  options: {
    accept: string;
    fetcher?: FetchLike;
    resolve?: ResolveHost;
  },
): Promise<{ finalUrl: string; contentType: string; body: Uint8Array }> {
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let current = input;
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const url = await validatePublicUrl(current, options.resolve ?? defaultResolve);
      const response = await fetcher(url, {
        redirect: "manual",
        headers: { accept: options.accept, "user-agent": "AshleyCuriosity/1.0" },
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects === MAX_REDIRECTS) throw new Error("too_many_redirects");
        const location = response.headers.get("location");
        if (!location) throw new Error("redirect_without_location");
        current = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) throw new Error(`http_${response.status}`);
      return {
        finalUrl: url.toString(),
        contentType: response.headers.get("content-type")?.toLowerCase() ?? "",
        body: await boundedBody(response),
      };
    }
    throw new Error("too_many_redirects");
  } finally {
    clearTimeout(timeout);
  }
}
