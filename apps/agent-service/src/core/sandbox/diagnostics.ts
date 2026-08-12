/**
 * Agent-side diagnostic catalog (Autonomous Engineering Workstation wave).
 *
 * The operator may choose bounded, read-only, networkless diagnostics. The
 * definitions themselves live in the broker (`DIAGNOSTIC_DEFINITIONS`); the
 * agent only needs the catalog of available ids to propose `run_diagnostic`.
 */

export const AGENT_AVAILABLE_DIAGNOSTICS: ReadonlyArray<string> = [
  "disk_free",
  "memory_usage",
  "load_average",
  "ashley_agent_status",
  "broker_status",
  "workspace_usage",
];
