/**
 * One article-fetch flight at a time. Interactive link-reads win; an idle tick
 * yields at the next safe boundary when chat needs the reader.
 */

type FlightRole = "tick" | "ondemand";

let owner: FlightRole | null = null;
let tickYieldRequested = false;

export function requestTickYield(): void {
  tickYieldRequested = true;
}

export function shouldTickYield(): boolean {
  return tickYieldRequested || owner === "ondemand";
}

export function clearTickYield(): void {
  tickYieldRequested = false;
}

export async function acquireArticleFlight(
  role: FlightRole,
  waitMs = 0,
): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, waitMs);
  while (owner !== null) {
    if (role === "ondemand") tickYieldRequested = true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  owner = role;
  if (role === "tick") tickYieldRequested = false;
  return true;
}

export function releaseArticleFlight(role: FlightRole): void {
  if (owner === role) owner = null;
}

export function articleFlightOwner(): FlightRole | null {
  return owner;
}
