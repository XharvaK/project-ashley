# P-02 Agent Plugins parser spike

This directory is a research and conformance spike for parsing Agent Plugins
v1.0.0 packages into deterministic, inert quarantine descriptors. It is not
production Ashley functionality and it provides no plugin runtime, MCP client,
tool registration, installation, trust, approval, or authority.

The parser reads only fixed v1 package locations, treats `SKILL.md` and MCP
configuration as data, preserves placeholders literally, and performs no
process, network, environment, credential, database, broker, or model access.
Every result remains quarantined, including a spec-valid result.

## Dependency boundary

The isolated package pins `yaml@2.9.0` as its only dependency. It is imported
only by `src/skill-frontmatter.mjs` to parse Agent Skills YAML frontmatter.
There is no MCP SDK, Agent Plugins SDK, transitive dependency, or root manifest
change. Schemas are selected from fixed local identifiers and are never fetched
at parse time.

One-time dependency preparation requires the registry unless the exact lockfile
artifact is already cached:

```powershell
npm ci --prefix spikes/p02-agent-plugins --ignore-scripts
```

After that, run the suite with npm forced offline:

```powershell
$env:npm_config_offline = 'true'
npm test --prefix spikes/p02-agent-plugins
```

## Spike-local safety budgets

The quarantine proof uses explicit deterministic limits: 64 KiB for
`plugin.json`, 256 KiB for `mcp.json`, 256 KiB per `SKILL.md`, 64 components per
component type, 8 MiB of retained skill text per package, 64 YAML syntax levels,
2,048 YAML nodes, and 100 expanded YAML aliases. File reads are handle-bound;
Linux opens additionally request nonblocking/no-follow behavior before type
validation. These are spike safeguards, not an adopted production policy; a
future integration gate must review them together with immutable staging and
worker isolation before reusing this parser contract.

The normalized output intentionally contains no timestamp, random identifier,
machine-specific package root, expanded secret, runtime result, or affirmative
authority state.
