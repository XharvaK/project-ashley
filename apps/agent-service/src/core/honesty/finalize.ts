import {
  claimsOwnGeneralActivity,
  claimsOwnReadingActivity,
  claimsOwnVisionActivity,
  claimsOwnConversationalReadActivity,
  claimsOwnExecutionRunning,
  claimsOwnExecutionAdmitted,
  claimsOwnExecutionCompletion,
  claimsOwnExecutionFailure,
  claimsOwnExecutionUnavailability,
  stripQuotedHypotheticals,
} from "./claims.js";
import type { OperationalClaimLicense } from "../sandbox/engineering-types.js";
import {
  deriveOperationalTruth,
  renderOperationalTruth,
} from "../sandbox/operational-truth.js";

export type HonestyFinalizeInput = {
  text: string;
  readingLicensed: boolean;
  affectLicensed?: boolean;
  visionLicensed?: boolean;
  conversationalReadLicensed?: boolean;
  operationalLicense?: OperationalClaimLicense;
};

export type HonestyFinalizeResult = {
  text: string;
  flooredActivity: boolean;
  flooredAffect: boolean;
};

const ACTIVITY_FALLBACK =
  "i haven't been doing anything worth mentioning on my side. what's up?";
const AFFECT_FALLBACK = "i don't have a grounded feeling to report about that.";
const AFFECT_CLAIM = /\b(?:i feel|i'm|i am)\s+(?:excited|happy|sad|upset|angry|anxious|tense|calm|hopeful|hurt|proud|frustrated|relieved|afraid|lonely)\b/i;

function stripUnlicensedActivity(
  text: string,
  options: {
    readingLicensed: boolean;
    visionLicensed: boolean;
    conversationalReadLicensed: boolean;
    operationalLicense?: OperationalClaimLicense;
  },
): string {
  const truth = deriveOperationalTruth(options.operationalLicense);
  const opState = truth.state !== "none" ? truth.state : (options.operationalLicense?.state ?? "none");

  const runningAllowed = opState === "running";
  const admittedAllowed =
    opState === "admitted" ||
    opState === "running" ||
    opState === "verified_success" ||
    opState === "verified_failure";
  const completionAllowed = opState === "verified_success";
  const failureAllowed = opState === "failed" || opState === "verified_failure";
  const hasOperationalContext = Boolean(
    options.operationalLicense &&
      (options.operationalLicense.taskId ||
        options.operationalLicense.profile ||
        options.operationalLicense.error ||
        options.operationalLicense.refusalReason ||
        options.operationalLicense.state !== "none"),
  );
  const isSandboxUnavailable =
    options.operationalLicense?.error === "sandbox_unavailable";
  const unavailabilityAllowed = !hasOperationalContext || isSandboxUnavailable;

  const isInspectionSuccess =
    options.operationalLicense?.profile === "project_investigation" &&
    opState === "verified_success";
  const readingPermitted = options.readingLicensed || isInspectionSuccess;

  return text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part.length) return false;
      const probe = stripQuotedHypotheticals(part);
      if (claimsOwnGeneralActivity(probe)) return false;
      if (!readingPermitted && claimsOwnReadingActivity(probe)) return false;
      if (!options.visionLicensed && claimsOwnVisionActivity(probe)) return false;
      if (!options.conversationalReadLicensed && claimsOwnConversationalReadActivity(probe)) return false;
      if (!runningAllowed && claimsOwnExecutionRunning(probe)) return false;
      if (!admittedAllowed && claimsOwnExecutionAdmitted(probe)) return false;
      if (!completionAllowed && claimsOwnExecutionCompletion(probe)) return false;
      if (!failureAllowed && claimsOwnExecutionFailure(probe)) return false;
      if (!unavailabilityAllowed && claimsOwnExecutionUnavailability(probe)) return false;
      return true;
    })
    .join(" ")
    .trim();
}

/**
 * Last-resort Honesty safety after Expression.
 * May strip/floor unlicensed activity claims; must never authorize claims.
 * Authorization originates on Decision.authorizedClaims and Decision.operationalLicense.
 */
export function finalizeHonesty(
  input: HonestyFinalizeInput,
): HonestyFinalizeResult {
  const truth = deriveOperationalTruth(input.operationalLicense);

  // When current-turn operational truth is locked terminal, the factual
  // operational result is rendered deterministically from OperationalTruth.
  // Expression inference cannot alter or replace authoritative operational reality.
  if (truth.locked && truth.semanticOutput) {
    return {
      text: truth.semanticOutput,
      flooredActivity: true,
      flooredAffect: false,
    };
  }

  const text = input.text.trim();
  const probe = stripQuotedHypotheticals(text);

  const opState = truth.state !== "none" ? truth.state : (input.operationalLicense?.state ?? "none");

  const runningAllowed = opState === "running";
  const admittedAllowed =
    opState === "admitted" ||
    opState === "running" ||
    opState === "verified_success" ||
    opState === "verified_failure";
  const completionAllowed = opState === "verified_success";
  const failureAllowed = opState === "failed" || opState === "verified_failure";
  const hasOperationalContext = Boolean(
    input.operationalLicense &&
      (input.operationalLicense.taskId ||
        input.operationalLicense.profile ||
        input.operationalLicense.error ||
        input.operationalLicense.refusalReason ||
        input.operationalLicense.state !== "none"),
  );
  const isSandboxUnavailable =
    input.operationalLicense?.error === "sandbox_unavailable";
  const unavailabilityAllowed = !hasOperationalContext || isSandboxUnavailable;

  const isInspectionSuccess =
    input.operationalLicense?.profile === "project_investigation" &&
    opState === "verified_success";
  const readingPermitted = input.readingLicensed || isInspectionSuccess;

  const unlicensedExecution =
    (!runningAllowed && claimsOwnExecutionRunning(probe)) ||
    (!admittedAllowed && claimsOwnExecutionAdmitted(probe)) ||
    (!completionAllowed && claimsOwnExecutionCompletion(probe)) ||
    (!failureAllowed && claimsOwnExecutionFailure(probe)) ||
    (!unavailabilityAllowed && claimsOwnExecutionUnavailability(probe));

  const unlicensedActivity =
    claimsOwnGeneralActivity(probe) ||
    (!readingPermitted && claimsOwnReadingActivity(probe)) ||
    (!input.visionLicensed && claimsOwnVisionActivity(probe)) ||
    (!input.conversationalReadLicensed &&
      claimsOwnConversationalReadActivity(probe)) ||
    unlicensedExecution;

  const unlicensedAffect = !input.affectLicensed && AFFECT_CLAIM.test(probe);
  if (!text || (!unlicensedActivity && !unlicensedAffect)) {
    return { text, flooredActivity: false, flooredAffect: false };
  }
  const strippedActivity = unlicensedActivity
    ? stripUnlicensedActivity(text, {
        readingLicensed: input.readingLicensed,
        visionLicensed: input.visionLicensed === true,
        conversationalReadLicensed: input.conversationalReadLicensed === true,
        operationalLicense: input.operationalLicense,
      })
    : text;
  const strippedAffect = unlicensedAffect
    ? strippedActivity
        .split(/(?<=[.!?])\s+|\r?\n+/)
        .map((part) => part.trim())
        .filter((part) => part && !AFFECT_CLAIM.test(stripQuotedHypotheticals(part)))
        .join(" ")
        .trim()
    : strippedActivity;

  if (!strippedAffect && !strippedActivity) {
    return {
      text: unlicensedAffect
        ? AFFECT_FALLBACK
        : (renderOperationalTruth(truth) ?? ACTIVITY_FALLBACK),
      flooredActivity: unlicensedActivity,
      flooredAffect: unlicensedAffect,
    };
  }
  return {
    text: strippedAffect || strippedActivity,
    flooredActivity: unlicensedActivity,
    flooredAffect: unlicensedAffect,
  };
}
