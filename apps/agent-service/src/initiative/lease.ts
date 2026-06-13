import type { DatabaseSync } from "node:sqlite";
import { deleteKv, getKv, setKv } from "../memory/kv.js";

const LEASE_MS = 120_000;

function leaseKey(ownerId: string): string {
  return `initiative_lease:${ownerId}`;
}

export function tryAcquireInitiativeLease(
  db: DatabaseSync,
  ownerId: string,
): boolean {
  const key = leaseKey(ownerId);
  const now = Date.now();
  const existing = getKv(db, key);
  if (existing && new Date(existing).getTime() > now) {
    return false;
  }
  setKv(db, key, new Date(now + LEASE_MS).toISOString());
  return true;
}

export function releaseInitiativeLease(
  db: DatabaseSync,
  ownerId: string,
): void {
  deleteKv(db, leaseKey(ownerId));
}

export function proactivePausedKey(ownerId: string): string {
  return `proactive_paused:${ownerId}`;
}

export function isProactivePausedDb(
  db: DatabaseSync,
  ownerId: string,
): boolean {
  return getKv(db, proactivePausedKey(ownerId)) === "true";
}

export function setProactivePausedDb(
  db: DatabaseSync,
  ownerId: string,
  paused: boolean,
): void {
  setKv(db, proactivePausedKey(ownerId), paused ? "true" : "false");
}
