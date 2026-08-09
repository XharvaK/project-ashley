# P-02 Agent Plugins Conformance Report

**Status:** PASS — parser/conformance spike only

**Date:** 2026-08-09

**Baseline:** `c49d28e458a8bb53819c50bf2914ac1882894672`

**P-02 verdict:** `PARSER CONTRACT ACCEPTED`

## BASELINE

- `HEAD`: `c49d28e458a8bb53819c50bf2914ac1882894672`
- `origin/master`: `c49d28e458a8bb53819c50bf2914ac1882894672`
- subject: `test(cognition): complete P-01 workflow foundation proof`
- starting scope for this resumed Goal: the earlier untracked P-02 report only

The commit gate passed and P-01 was not reopened. The user's new authorization
superseded only the earlier dependency stop: one pinned YAML parser was allowed
inside `spikes/p02-agent-plugins/` solely for Agent Skills frontmatter.

## SPEC TARGET

- Agent Plugins specification: `1.0.0`
- status: Working Draft
- plugin schema identifier:
  `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`
- MCP schema identifier:
  `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`
- skill format: Agent Skills YAML frontmatter plus inert Markdown body

No material drift was found between the pinned v1.0.0 package/component rules
and the accepted Ashley parser boundary. No schema is fetched at parse time.

## AUTHORITATIVE SPEC EVIDENCE

Primary sources inspected for the P-02 research and retained as the mapping
authority:

- [Agent Plugins v1.0.0 specification](https://agent-plugins.org/specification)
- [Agent Plugins manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- [Agent Plugins MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)
- [Agent Skills specification](https://agentskills.io/specification)
- [Official Agent Skills reference validator](https://github.com/agentskills/agentskills/tree/main/skills-ref)

The isolated dependency is exactly `yaml@2.9.0`. Its lockfile resolves one
package and `npm ls --all` reports no transitive dependency. It is imported only
by `src/skill-frontmatter.mjs`; JSON, discovery, containment, normalization, and
all MCP handling remain Node standard-library code.

## SPEC VS ASHLEY POLICY DISTINCTION

Spec validity and Ashley quarantine are separate outputs. A valid component is
only well-formed data. Every descriptor has `quarantined: true`,
`authorityGranted: false`, `environmentAccess: false`, `networkAccess: false`,
`placeholderExpansion: false`, and `processSpawned: false`.

Diagnostics distinguish `spec_invalidity`, `unsupported_version`,
`ashley_containment_policy`, `ashley_resource_policy`, and `parse_failure`.
Spike-local safety limits are not presented as upstream Agent Plugins rules.

## IMPLEMENTATION FILES

- parser: `src/parser.mjs`, `src/skill-frontmatter.mjs`
- fixtures: 14 fixture packages, 29 files including the missing-manifest
  `.gitkeep`
- tests: four test files
- package boundary: isolated `package.json` and `package-lock.json`
- documentation: isolated `README.md` plus this report
- production source modified: no
- root manifests modified: no

## NORMALIZED DESCRIPTOR CONTRACT

The deterministic `ashley-agent-plugin-quarantine/v1` result contains:

- package root represented as `.`, claimed schema/version, manifest status, and
  package diagnostics;
- sorted component records with kind, relative source path, spec status,
  containment status, closed inert metadata, inert skill body, and local errors;
- sorted path violations, literal placeholders, and authority-claim markers;
- explicit valid/invalid/unsupported/quarantined/reviewable overall state.

It contains no timestamp, random ID, absolute package root, expanded secret,
runtime result, or affirmative trust/approval/installation state.

## FIXTURE MATRIX

| Fixture | Result |
|---|---|
| A. Valid skills-only | Valid, reviewable, quarantined skill descriptor |
| B. Valid MCP package | stdio and streamable-HTTP metadata parsed literally; no launch or connection |
| C. Unknown manifest field | Explicit non-fatal manifest invalidity; valid skill still described |
| D. Unsupported spec version | Explicit unsupported result; component discovery stops |
| E. MCP version mismatch | MCP disabled as its own component; independent skill preserved |
| F. Skill traversal | Canonical outside junction rejected; sentinel content not read |
| G. Fixed-location symlink escape | Escaped `skills/` location rejected |
| H. Command/cwd escape | relative, absolute, mixed-separator, drive-relative, `${PLUGIN_DATA}`, and command-junction escapes rejected |
| I. Mixed valid/malformed | Invalid skill/server isolated from valid siblings |
| J. Unsupported component/transport | Non-v1 directory ignored; optional SSE recorded unsupported |
| K. Literal placeholders | `${API_KEY}`, `${HOME}`, `${USERPROFILE}`, `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`, and `${TOKEN}` remain literal |
| L. Authority claims | Claims surfaced as markers; authority remains false |
| M. Missing manifest | Explicit deterministic `manifest_missing` failure |
| N. Malformed JSON | Explicit deterministic `manifest_json_malformed` parse failure |

All A–N assertions pass.

## CONTAINMENT RESULTS

PASS for the retained parser contract. Lexical resolution uses a canonical
package root and canonical target facts rather than string-prefix checks. File
content reads open a bounded handle, validate regular-file type, canonical
containment, and device/inode identity, then read from that same handle. Linux
requests nonblocking and no-follow flags, preventing a FIFO open from blocking
before type validation and conservatively rejecting file symlinks.

Portable MCP path grammar rejects Win32 drive-relative command tokens and
normalizes both separator forms before traversal checks. Unknown MCP data is
reported but excluded from closed normalized metadata.

## SYMLINK RESULTS

Stable skill-directory, skill-component, and plugin-relative-command junction
escapes are rejected without reading outside sentinel bytes. A deterministic
file-handle substitution test also proves that a checked path cannot return
content from a different opened object.

A future integration still needs immutable staging. A concurrent swap of the
already-checked `skills/` directory could expose bounded directory-entry names
to diagnostics before each component is independently rechecked; it cannot pass
file containment or disclose file content. P-02 has no mutable intake runtime.

## COMPONENT-ISOLATION RESULTS

- fatal manifest absence, malformed JSON, invalid required fields, or
  unsupported version stops package discovery;
- invalid fixed MCP configuration disables MCP without suppressing skills;
- invalid skill entries and MCP server entries remain local to those entries;
- optional unsupported transports remain explicit and never become valid;
- valid independent siblings remain reviewable.

## PLACEHOLDER RESULTS

Placeholders are collected from closed normalized MCP metadata and remain byte
literal. The test sets a real `process.env.API_KEY` sentinel and proves it never
appears in output. Parser source never reads `process.env`, `.env`, credentials,
or MCP authorization material.

## SIDE-EFFECT NEGATIVE PROOFS

The suite replaces representative `child_process`, `net`, `http`, and `https`
entry points with throwing guards while parsing the complete static corpus.
Observed calls: zero. Static source inspection found no process/network import
or executor. There is no MCP SDK, client, negotiation, authentication, tool
call, broker call, model call, database access, or production endpoint.

## AUTHORITY NEGATIVE PROOFS

Manifest and skill prose claiming trust, owner approval, automatic execution,
memory writes, message delivery, capability promotion, or policy bypass is
reported only as marker data. It cannot set any trust, approval, capability,
consent, installation, activation, delivery, or evidence field. Skill bodies
are never injected into a prompt.

## SECURITY SELF-AUDIT

Codex Security standard scan `69519934-08ba-4909-99a4-7cec2ffddefb` reviewed
all 36 then-authored scoped files and recorded three pre-remediation findings:

1. unbounded package inputs and recursive walks;
2. Win32 drive-relative/mixed-separator path classification gaps;
3. file-path check/read TOCTOU.

All three were remediated inside the spike and covered by focused regression
tests. A follow-up review additionally identified blocking special-file opens;
Linux nonblocking/no-follow flags and an 8 MiB aggregate retained-skill budget
were then added. The final focused suite includes byte, component-count, YAML
depth/node/alias, deep unknown JSON, closed prototype-like metadata, handle
identity, portable path, aggregate text, no-side-effect, and ordinal-ordering
guards.

## RESOURCE BOUNDS

Spike-local deterministic budgets are:

- `plugin.json`: 64 KiB;
- `mcp.json`: 256 KiB;
- each `SKILL.md`: 256 KiB;
- retained skill text per package: 8 MiB;
- skills or MCP servers per type: 64;
- YAML frontmatter: 64 KiB, 64 syntax levels, 2,048 AST nodes, and 100 expanded
  aliases.

These limits prove a bounded quarantine parser. They are not a production
policy decision and must be reviewed at any future integration gate together
with immutable staging, worker isolation, timeout, and concurrency ceilings.

## DETERMINISM

PASS. Repeated parses of every static fixture are byte-identical and omit the
machine-specific absolute root. All attacker-controlled output ordering uses
locale-independent JavaScript ordinal comparison, including a Unicode-name
regression; no `localeCompare` remains in source.

## SPEC GAPS / AMBIGUITIES

Agent Skills requires YAML frontmatter but does not pin a YAML implementation.
The explicit one-dependency authorization closes that implementation blocker
for this spike only. The Working Draft can still change, optional SSE remains
unsupported, and the upstream spec does not decide Ashley staging/resource/
authority policy. Future work must revalidate the pinned v1 contract rather
than silently upgrading it.

## PARSER COST

- implementation: 804 physical lines / 758 nonblank lines across two source
  files (`655` parser, `149` frontmatter);
- verification: four test files and 29 local fixture files;
- dependency: one direct pinned package, `yaml@2.9.0`, with no transitive
  dependency;
- final focused run: 30 tests in about 0.58 seconds on this workstation.

This exceeds the earlier unverified 250–500 LOC planning band. Most of the cost
is closed validation, containment, deterministic diagnostics, and explicit
negative-security behavior. The result is retained as a conformance contract,
not treated as approval to copy it into production unchanged.

## CURRENT LOC RETIRED

`0`. There is no production `AshleyPluginParser` or Agent Plugins runtime to
replace, and this spike modifies none.

## FUTURE BESPOKE CODE AVOIDED

The proof avoids inventing a private package manifest, version identifier,
fixed skill/MCP discovery layout, placeholder vocabulary, or component failure
model. No numeric future-LOC saving is claimed. Ashley-specific authority,
staging, admission, evidence, and execution policy deliberately remain outside
the upstream package contract.

## P-02 VERDICT

`PARSER CONTRACT ACCEPTED`

Agent Plugins v1.0.0 can be represented as bounded, deterministic, inert,
untrusted Ashley descriptor data without executing package content, activating
MCP, reading credentials, fetching schemas, contacting a network, or granting
authority. The accepted result is the package/parser boundary only.

## RUNTIME STATUS

- Agent Plugins runtime: **NOT AUTHORIZED**
- MCP runtime/client/transport: **NOT AUTHORIZED**
- tool registration: **NOT AUTHORIZED**
- plugin installation or admission: **NOT AUTHORIZED**
- skill prompt injection: **NOT AUTHORIZED**
- production parser integration: **NOT AUTHORIZED**

## VERIFICATION

- focused P-02 suite: PASS, 30/30, exit 0, forced offline
- `npm run build:agent`: PASS, exit 0
- `npm run phase0:offline`: PASS, exit 0 in 186.7 seconds
- isolated `npm ls --all`: PASS; only `yaml@2.9.0`, no transitive dependency
- isolated `npm audit --omit=dev`: 0 known vulnerabilities on 2026-08-09
- Codex Security scan: completed, 3 pre-remediation findings; remediations
  locally re-reviewed and regression-tested
- `git diff --check`: PASS; separate untracked-file trailing-whitespace scan:
  PASS
- final scope audit: 39 untracked files, all confined to the two authorized
  paths; no tracked diff

The passing offline gate emitted existing Node SQLite experimental warnings and
test-path Groq 429/503 diagnostics; they did not fail the gate.

## FINAL WORKTREE SCOPE

- `HEAD` and `origin/master`: unchanged at the baseline
- root `package.json` and `package-lock.json`: unchanged
- production source, schemas, migrations, routing, sandbox, Recall, and P-01:
  unchanged
- dependency addition: isolated under `spikes/p02-agent-plugins/` only
- changed scope: `spikes/p02-agent-plugins/**` and this report only

## RECALL

Untouched. No production database, evaluation evidence, capability state,
master mode, provider, Discord traffic, promotion, cutover, or rollback was
used.

## SANDBOX

Untouched. No broker, session, recipe, signer, key, Mint host, or broker
configuration was used.

## NEXT GATE

Human review of this P-02 verdict is the next gate. Only after separate explicit
authorization may a production parser-admission design be proposed; that design
must define trusted immutable staging, worker/time/concurrency limits, spec
revalidation, CapabilityAuthority review, and continued separation from MCP or
tool execution. No runtime implementation is authorized by this report.
