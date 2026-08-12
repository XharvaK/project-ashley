/**
 * Self-improvement clone orchestration (Autonomous Engineering Workstation
 * wave).
 *
 * Ashley maintains a PERSISTENT, ISOLATED, sandbox-owned clone of herself. She
 * may experiment and commit candidate changes locally there, but the clone
 * MUST contain no secrets, and push is impossible (networkless + disabled
 * remote + no signing). Once per durable review interval (epoch + 7 days) she
 * surfaces ONE coherent candidate review commit for Doc.
 *
 * This module is pure logic: it tracks clone metadata, source binding, commit
 * bookkeeping and the weekly review schedule. The actual clone sync is a
 * host/CLI operation (scripts/mint) that the broker never performs for the
 * live checkout.
 */

export const SELF_IMPROVEMENT_REVIEW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export const SELF_IMPROVEMENT_CLONE_ROOT = "/var/lib/ashley-sandbox/self-improvement/project-ashley";

export type SelfImprovementCloneState = {
  cloneRoot: string;
  sourceProjectId: string;
  sourceCanonicalRoot: string;
  sourceBaseCommit: string;
  /** Candidate commits authored locally inside the clone (never pushed). */
  candidateCommits: CandidateCommitRecord[];
  /** Activation epoch for the durable review interval. */
  activationEpochMs: number;
  lastReviewAtMs: number | null;
  /** Doc-facing weekly review artifact references. */
  weeklyReviewRefs: string[];
};

export type CandidateCommitRecord = {
  sha: string;
  parentSha: string;
  title: string;
  problem: string;
  whyImportant: string;
  filesChanged: string[];
  diffStat: string;
  testsRun: string[];
  testResults: string;
  knownLimitations: string;
  remainingUncertainty: string;
  securityImpact: "none" | "low" | "high_sensitivity_review";
  touchesSandboxSecurity: boolean;
  touchesDependencyManifest: boolean;
  touchesMigration: boolean;
  touchesBehavior: boolean;
  ownerReviewFocus: string;
};

export function initCloneState(params: {
  sourceProjectId: string;
  sourceCanonicalRoot: string;
  sourceBaseCommit: string;
  activationEpochMs: number;
  cloneRoot?: string;
}): SelfImprovementCloneState {
  return {
    cloneRoot: params.cloneRoot ?? SELF_IMPROVEMENT_CLONE_ROOT,
    sourceProjectId: params.sourceProjectId,
    sourceCanonicalRoot: params.sourceCanonicalRoot,
    sourceBaseCommit: params.sourceBaseCommit,
    candidateCommits: [],
    activationEpochMs: params.activationEpochMs,
    lastReviewAtMs: null,
    weeklyReviewRefs: [],
  };
}

export function nextReviewDueMs(state: SelfImprovementCloneState, nowMs: number): number {
  const base = state.lastReviewAtMs ?? state.activationEpochMs;
  // Durable interval from the last review (or activation epoch) — not a fixed weekday.
  let due = base + SELF_IMPROVEMENT_REVIEW_INTERVAL_MS;
  while (due <= nowMs) {
    due += SELF_IMPROVEMENT_REVIEW_INTERVAL_MS;
  }
  return due;
}

export function isReviewDue(state: SelfImprovementCloneState, nowMs: number): boolean {
  const base = state.lastReviewAtMs ?? state.activationEpochMs;
  return nowMs >= base + SELF_IMPROVEMENT_REVIEW_INTERVAL_MS;
}

/**
 * Select the single best coherent candidate commit for the weekly review.
 * Picks the most recent candidate commit; the agent is expected to have
 * squashed/rebased internally to one coherent commit before calling this.
 */
export function selectWeeklyCandidate(
  state: SelfImprovementCloneState,
): CandidateCommitRecord | null {
  if (state.candidateCommits.length === 0) return null;
  return state.candidateCommits[state.candidateCommits.length - 1]!;
}

/**
 * Produce the Doc-facing weekly review report. Returns null when there is
 * nothing worthwhile, so Ashley never fabricates a pointless change.
 */
export function buildWeeklyReview(
  state: SelfImprovementCloneState,
  nowMs: number,
): { reportRef: string; candidate: CandidateCommitRecord } | null {
  if (!isReviewDue(state, nowMs)) return null;
  const candidate = selectWeeklyCandidate(state);
  if (!candidate) return null;
  return { reportRef: `weekly-review-${nowMs.toString(36)}`, candidate };
}
