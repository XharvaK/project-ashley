/**
 * Strict execution environment builder (SANDBOX-ISOLATION-01).
 *
 * The recipe child must never inherit the broker's ambient secrets or
 * capability seams. This builder is the single place an execution
 * environment is constructed:
 *
 *   - only allowlisted names may appear at all;
 *   - the denylist APPENDS over the allowlist — a denylisted name is
 *     dropped even if a recipe explicitly allowed it;
 *   - `HOME` is always the synthetic per-run directory supplied by the
 *     broker (provider keys and credential helpers in the real home are
 *     unreachable);
 *   - `PATH` is always the broker-fixed value when allowlisted, so a child
 *     can never resolve host-installed tools from ambient PATH;
 *   - `NODE_OPTIONS` is always denied (arbitrary loader/code paths before
 *     the recipe's own entry point);
 *   - defaults (e.g. git interactivity guards) apply only to allowlisted
 *     names the source omits.
 */

export const EXECUTION_ENV_DEFAULT_PATH = "/usr/bin:/bin";

const DENY_PREFIXES: readonly string[] = [
  "ASHLEY_SANDBOX_",
  "SSH_",
  "AWS_",
  "npm_config_",
  "NPM_CONFIG_",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
];

const DENY_NAMES: ReadonlySet<string> = new Set([
  "NODE_OPTIONS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "GIT_ASKPASS",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
]);

export function isDeniedEnvironmentName(name: string): boolean {
  if (DENY_NAMES.has(name)) return true;
  for (const prefix of DENY_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

export type BuildExecutionEnvironmentOptions = {
  /** Recipe-declared allowlist. Only these names may appear. */
  allowlist: readonly string[];
  /** Broker-owned environment source (e.g. the broker process env). */
  source: Readonly<Record<string, string | undefined>>;
  /** Synthetic per-run home directory; always used for `HOME`. */
  homeDir: string;
  /** Broker-owned PATH value used whenever PATH is allowlisted. */
  fixedPath?: string;
  /** Safe values applied to allowlisted names the source omits. */
  defaults?: Readonly<Record<string, string>>;
};

/**
 * Builds the strict execution environment. The denylist always wins over
 * the allowlist; `HOME` is always synthetic; `PATH` is always broker-fixed.
 */
export function buildExecutionEnvironment(
  options: BuildExecutionEnvironmentOptions,
): Record<string, string> {
  const {
    allowlist,
    source,
    homeDir,
    fixedPath = EXECUTION_ENV_DEFAULT_PATH,
    defaults = {},
  } = options;
  const env: Record<string, string> = {};
  for (const name of allowlist) {
    if (isDeniedEnvironmentName(name)) continue;
    if (name === "HOME") {
      env.HOME = homeDir;
      continue;
    }
    if (name === "PATH") {
      env.PATH = fixedPath;
      continue;
    }
    const value = source[name];
    if (value === undefined || value.length === 0) {
      const fallback = defaults[name];
      if (fallback !== undefined) env[name] = fallback;
      continue;
    }
    env[name] = value;
  }
  return env;
}
