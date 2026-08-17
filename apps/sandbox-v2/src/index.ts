/**
 * @composer-assistant/sandbox-v2 — Sandbox V2 typed-capability kernel
 * (Sandbox V2 M2).
 *
 * Exports the V2 vocabulary, capability registry, operator-owned project
 * read registry, request validation, the typed dispatcher seam, the
 * read-only project-inspection family (read_file / list_directory /
 * search_text) and the M1 roundtrip adapter. All boundaries fail closed.
 */

export {
  SANDBOX_V2_OPERATION_NAMES,
  V2_DEFERRED_OPERATIONS,
  V2_CAPABILITY_REGISTRY,
  v2CapabilitySpec,
  isSandboxV2Request,
  isProjectReadFileResult,
  isProjectListDirectoryResult,
  isProjectSearchTextResult,
  isSandboxV2OperationResult,
} from "./v2-types.js";
export type {
  SandboxV2OperationName,
  SandboxV2Request,
  SandboxV2Result,
  SandboxV2OperationResult,
  SandboxV2CapabilitySpec,
  SandboxV2InspectionEntry,
  SandboxV2SearchMatch,
  SandboxV2FileRoundtripRequest,
  SandboxV2ProjectReadFileRequest,
  SandboxV2ProjectListDirectoryRequest,
  SandboxV2ProjectSearchTextRequest,
} from "./v2-types.js";

export { V2_LIMITS, V2_HOST_FACTS, V2_SECRET_ENV_KEY } from "./limits.js";

export {
  V2ProjectReadRegistry,
  type ProjectReadResolution,
} from "./registry.js";

export {
  validateProjectInspectionRequest,
  type ProjectInspectionValidation,
} from "./validation.js";

export { SANDBOX_V2_INSPECTION_RUNNER_SOURCE } from "./project-inspection/runner.js";
export {
  isInspectionRunnerEvidence,
  type InspectionRunnerChecks,
  type InspectionRunnerEvidence,
} from "./project-inspection/evidence.js";
export {
  buildSanitizedProjectView,
  removeProjectView,
  V2_VIEW_COPY_LIMITS,
  type ProjectSourceViewResult,
} from "./project-inspection/source-view.js";
export {
  executeProjectInspection,
  spawnBubblewrapInspection,
  isV2InspectionAvailable,
  type ProjectInspectionExecutorOptions,
  type InspectionSpawn,
  type InspectionSpawnInput,
  type InspectionSpawnOutput,
} from "./project-inspection/executor.js";

export {
  handleFileRoundtripV2,
  isM1RoundtripAvailable,
  type M1RoundtripExecutorOptions,
} from "./adapters/m1-roundtrip.js";

export { SandboxV2Dispatcher, type SandboxV2Environment, type SandboxV2DispatchOptions }
  from "./dispatch.js";