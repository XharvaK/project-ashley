export type BaseCapture = {
  baseCommit: string;
  baseTreeHash: string;
  repositoryIdentity: string;
  sourceCleanliness: "clean" | "dirty_blocked" | "dirty_explicit_manifest";
};

export function compareBase(
  stored: { baseCommit: string | null; baseTreeHash: string | null },
  live: { baseCommit: string; baseTreeHash: string },
): boolean {
  return (
    stored.baseCommit === live.baseCommit && stored.baseTreeHash === live.baseTreeHash
  );
}
