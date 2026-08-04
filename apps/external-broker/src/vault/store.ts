import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { VAULT_SESSION_TTL_MS } from "../constants/limits.js";
import { randomRef, sha256Hex } from "../crypto/types.js";

export interface VaultCredential {
  credentialRef: string;
  entityUuid: string;
  ownerId: string;
  label: string;
  lineageRef: string;
  createdAtMs: number;
  revokedAtMs?: number;
}

export interface VaultSession {
  sessionHandle: string;
  credentialRef: string;
  actionId: string;
  ownerId: string;
  expiresAtMs: number;
}

interface EncryptedSecret {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

export class VaultStore {
  private readonly masterKey: Buffer;
  private readonly secrets = new Map<string, EncryptedSecret>();
  readonly credentials = new Map<string, VaultCredential>();
  readonly sessions = new Map<string, VaultSession>();
  private generation = 0;

  constructor(masterKey: Buffer) {
    if (masterKey.length !== 32) {
      throw new Error("vault_master_key_invalid");
    }
    this.masterKey = masterKey;
  }

  invalidateSessionsOnRestart(): void {
    this.generation += 1;
    this.sessions.clear();
  }

  vaultIngestOperator(
    ownerId: string,
    label: string,
    plaintext: Buffer,
    nowMs = Date.now(),
  ): VaultCredential {
    const credentialRef = randomRef(16);
    const entityUuid = randomUUID();
    const lineageRef = randomRef(16);
    this.secrets.set(credentialRef, this.encrypt(plaintext));
    const credential: VaultCredential = {
      credentialRef,
      entityUuid,
      ownerId,
      label,
      lineageRef,
      createdAtMs: nowMs,
    };
    this.credentials.set(credentialRef, credential);
    return credential;
  }

  revokeCredential(credentialRef: string, nowMs = Date.now()): boolean {
    const credential = this.credentials.get(credentialRef);
    if (!credential || credential.revokedAtMs) {
      return false;
    }
    credential.revokedAtMs = nowMs;
    this.secrets.delete(credentialRef);
    for (const [handle, session] of this.sessions.entries()) {
      if (session.credentialRef === credentialRef) {
        this.sessions.delete(handle);
      }
    }
    return true;
  }

  createSession(
    ownerId: string,
    credentialRef: string,
    actionId: string,
    nowMs = Date.now(),
  ): { ok: true; session: VaultSession } | { ok: false; reason: string } {
    const credential = this.credentials.get(credentialRef);
    if (!credential || credential.ownerId !== ownerId) {
      return { ok: false, reason: "credential_not_found" };
    }
    if (credential.revokedAtMs) {
      return { ok: false, reason: "credential_revoked" };
    }
    if (!this.secrets.has(credentialRef)) {
      return { ok: false, reason: "credential_unavailable" };
    }
    const session: VaultSession = {
      sessionHandle: randomRef(16),
      credentialRef,
      actionId,
      ownerId,
      expiresAtMs: nowMs + VAULT_SESSION_TTL_MS,
    };
    this.sessions.set(session.sessionHandle, session);
    return { ok: true, session };
  }

  resolveSession(
    sessionHandle: string,
    actionId: string,
    nowMs = Date.now(),
  ): { ok: true; secret: Buffer } | { ok: false; reason: string } {
    const session = this.sessions.get(sessionHandle);
    if (!session) {
      return { ok: false, reason: "invalid_session" };
    }
    if (session.actionId !== actionId) {
      return { ok: false, reason: "session_action_mismatch" };
    }
    if (session.expiresAtMs <= nowMs) {
      this.sessions.delete(sessionHandle);
      return { ok: false, reason: "session_expired" };
    }
    const encrypted = this.secrets.get(session.credentialRef);
    if (!encrypted) {
      return { ok: false, reason: "credential_unavailable" };
    }
    try {
      return { ok: true, secret: this.decrypt(encrypted) };
    } catch {
      return { ok: false, reason: "decrypt_failed" };
    }
  }

  zeroizeSession(sessionHandle: string): void {
    this.sessions.delete(sessionHandle);
  }

  metadata(credentialRef: string): VaultCredential | undefined {
    const credential = this.credentials.get(credentialRef);
    if (!credential) {
      return undefined;
    }
    return { ...credential };
  }

  safeErrorMessage(reason: string): string {
    return `vault_error:${reason}`;
  }

  fingerprintSecret(plaintext: Buffer): string {
    return sha256Hex(plaintext);
  }

  private encrypt(plaintext: Buffer): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { iv, authTag, ciphertext };
  }

  private decrypt(secret: EncryptedSecret): Buffer {
    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, secret.iv);
    decipher.setAuthTag(secret.authTag);
    return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]);
  }
}
