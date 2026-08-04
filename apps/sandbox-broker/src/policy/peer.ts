export function assertOwnerPeer(
  peerOwnerId: string,
  expectedOwnerId: string,
): { ok: true } | { ok: false; reason: string } {
  if (peerOwnerId !== expectedOwnerId) {
    return { ok: false, reason: "peer_not_owner" };
  }
  return { ok: true };
}
