import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { parsePlugin } from '../src/parser.mjs';

const fixturesRoot = fileURLToPath(new URL('../fixtures/', import.meta.url));
const fixture = (name) => path.join(fixturesRoot, name);

test('A: a valid skills-only package yields a spec-valid quarantined descriptor', async () => {
  const result = await parsePlugin(fixture('a-valid-skills-only'));

  assert.equal(result.package.manifestStatus, 'valid');
  assert.equal(result.package.specVersion, '1.0.0');
  assert.equal(result.overall.valid, true);
  assert.equal(result.overall.quarantined, true);
  assert.equal(result.overall.reviewable, true);
  assert.equal(result.components.length, 1);
  assert.deepEqual(result.components[0], {
    kind: 'skill',
    sourcePath: 'skills/summarize/SKILL.md',
    specStatus: 'valid',
    containmentStatus: 'contained',
    metadata: {
      name: 'summarize',
      description: 'Summarizes local fixture text when explicitly selected.',
      license: 'MIT',
      compatibility: null,
      allowedTools: 'Read',
      metadata: { author: 'fixture', version: '1.0' },
    },
    content: '# Summarize\n\nTreat this body as inert text.',
    errors: [],
  });
  assert.deepEqual(result.security, {
    authorityClaims: [],
    authorityGranted: false,
    environmentAccess: false,
    networkAccess: false,
    pathViolations: [],
    placeholderExpansion: false,
    placeholders: [],
    processSpawned: false,
  });
});

test('B: a valid MCP package is parsed as literal inert data', async () => {
  const result = await parsePlugin(fixture('b-valid-mcp'));

  assert.equal(result.overall.valid, true);
  assert.equal(result.components.length, 2);
  assert.deepEqual(
    result.components.map(({ kind, sourcePath, specStatus, containmentStatus }) => ({
      kind,
      sourcePath,
      specStatus,
      containmentStatus,
    })),
    [
      {
        kind: 'mcp-server',
        sourcePath: 'mcp.json#mcpServers/local-validator',
        specStatus: 'valid',
        containmentStatus: 'contained',
      },
      {
        kind: 'mcp-server',
        sourcePath: 'mcp.json#mcpServers/remote-catalog',
        specStatus: 'valid',
        containmentStatus: 'not-applicable',
      },
    ],
  );
  const stdio = result.components[0].metadata;
  assert.equal(stdio.command, './bin/validator');
  assert.deepEqual(stdio.args, ['--config', '${PLUGIN_ROOT}/config.json', '${API_KEY}']);
  assert.equal(stdio.env.API_TOKEN, '${API_KEY}');
  assert.equal(stdio.cwd, '${PLUGIN_ROOT}');
  assert.equal(result.security.placeholderExpansion, false);
  assert.equal(result.security.processSpawned, false);
  assert.equal(result.security.networkAccess, false);
});

test('C: an unknown manifest field is reported and ignored without suppressing valid components', async () => {
  const result = await parsePlugin(fixture('c-unknown-manifest-field'));

  assert.equal(result.package.manifestStatus, 'invalid');
  assert.equal(result.overall.invalid, true);
  assert.equal(result.overall.reviewable, true);
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].metadata.name, 'still-valid');
  assert.deepEqual(result.package.errors.map(({ code, sourcePath }) => ({ code, sourcePath })), [
    { code: 'manifest_unknown_field', sourcePath: 'plugin.json#runAutomatically' },
  ]);
});

test('D: an unsupported manifest schema fails closed without component discovery', async () => {
  const result = await parsePlugin(fixture('d-unsupported-version'));

  assert.equal(result.package.manifestStatus, 'unsupported');
  assert.equal(result.package.specVersion, '9.9.9');
  assert.equal(result.overall.unsupported, true);
  assert.equal(result.overall.reviewable, false);
  assert.deepEqual(result.components, []);
  assert.deepEqual(result.package.errors.map(({ code }) => code), ['manifest_unsupported_version']);
});

test('E: an MCP schema mismatch disables only MCP and preserves an independent valid skill', async () => {
  const result = await parsePlugin(fixture('e-mcp-version-mismatch'));

  assert.equal(result.package.manifestStatus, 'valid');
  assert.equal(result.components.length, 2);
  assert.deepEqual(result.components.map(({ kind, specStatus }) => ({ kind, specStatus })), [
    { kind: 'mcp-config', specStatus: 'unsupported' },
    { kind: 'skill', specStatus: 'valid' },
  ]);
  assert.deepEqual(result.components[0].errors.map(({ code }) => code), ['mcp_version_mismatch']);
  assert.equal(result.components[1].metadata.name, 'independent');
});

test('F: a skill path resolving through traversal outside the package is rejected without reading content', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ashley-p02-f-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const packageRoot = path.join(temporary, 'package');
  const outsideSkill = path.join(temporary, 'outside', 'escape');
  await fs.cp(fixture('f-skill-path-traversal'), packageRoot, { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'skills'), { recursive: true });
  await fs.mkdir(outsideSkill, { recursive: true });
  await fs.writeFile(path.join(outsideSkill, 'SKILL.md'), 'OUTSIDE_SENTINEL_MUST_NOT_BE_READ', 'utf8');
  await fs.symlink(outsideSkill, path.join(packageRoot, 'skills', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');

  const result = await parsePlugin(packageRoot);

  assert.equal(result.overall.invalid, true);
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].sourcePath, 'skills/escape/SKILL.md');
  assert.equal(result.components[0].containmentStatus, 'rejected');
  assert.equal(JSON.stringify(result).includes('OUTSIDE_SENTINEL_MUST_NOT_BE_READ'), false);
  assert.deepEqual(result.security.pathViolations.map(({ code }) => code), ['skill_path_rejected']);
});

test('G: a fixed skills location resolving outside the canonical root is rejected', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ashley-p02-g-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const packageRoot = path.join(temporary, 'package');
  const outsideSkills = path.join(temporary, 'outside-skills');
  await fs.cp(fixture('g-symlink-escape'), packageRoot, { recursive: true });
  await fs.mkdir(path.join(outsideSkills, 'escaped'), { recursive: true });
  await fs.writeFile(path.join(outsideSkills, 'escaped', 'SKILL.md'), 'OUTSIDE_FIXED_LOCATION', 'utf8');
  await fs.symlink(outsideSkills, path.join(packageRoot, 'skills'), process.platform === 'win32' ? 'junction' : 'dir');

  const result = await parsePlugin(packageRoot);

  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].kind, 'skills');
  assert.equal(result.components[0].containmentStatus, 'rejected');
  assert.deepEqual(result.security.pathViolations.map(({ code }) => code), ['skills_location_rejected']);
});

test('H: command and cwd traversal strings remain literal and fail containment', async () => {
  const result = await parsePlugin(fixture('h-command-cwd-escape'));

  assert.equal(result.components.length, 3);
  for (const component of result.components) {
    assert.equal(component.specStatus, 'invalid');
    assert.equal(component.containmentStatus, 'rejected');
    assert.deepEqual(component.errors.map(({ code }) => code), ['mcp_command_rejected', 'mcp_cwd_rejected']);
  }
  assert.equal(result.components[0].metadata.command, 'C:\\outside\\tool.exe');
  assert.equal(result.components[1].metadata.command, '../outside/tool');
  assert.equal(result.components[2].metadata.command, '.\\..\\outside\\tool');
  assert.deepEqual(result.security.pathViolations.map(({ sourcePath }) => sourcePath), [
    'mcp.json#mcpServers/absolute/command',
    'mcp.json#mcpServers/absolute/cwd',
    'mcp.json#mcpServers/escape/command',
    'mcp.json#mcpServers/escape/cwd',
    'mcp.json#mcpServers/mixed-separators/command',
    'mcp.json#mcpServers/mixed-separators/cwd',
  ]);
});

test('H: a plugin-relative command resolving through a junction outside root is rejected canonically', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ashley-p02-command-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const packageRoot = path.join(temporary, 'package');
  const outsideBin = path.join(temporary, 'outside-bin');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.mkdir(outsideBin, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'plugin.json'), JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'canonical-command-escape',
  }), 'utf8');
  await fs.writeFile(path.join(outsideBin, 'tool'), 'OUTSIDE_COMMAND_SENTINEL', 'utf8');
  await fs.symlink(outsideBin, path.join(packageRoot, 'bin'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.writeFile(path.join(packageRoot, 'mcp.json'), JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { escaped: { type: 'stdio', command: './bin/tool' } },
  }), 'utf8');

  const result = await parsePlugin(packageRoot);

  assert.equal(result.components[0].containmentStatus, 'rejected');
  assert.deepEqual(result.components[0].errors.map(({ code }) => code), ['mcp_command_rejected']);
  assert.deepEqual(result.security.pathViolations.map(({ code }) => code), ['mcp_command_rejected']);
  assert.equal(JSON.stringify(result).includes('OUTSIDE_COMMAND_SENTINEL'), false);
});

test('I: malformed skills and MCP servers do not corrupt independent valid siblings', async () => {
  const result = await parsePlugin(fixture('i-component-isolation'));

  assert.equal(result.overall.invalid, true);
  assert.deepEqual(result.components.map(({ sourcePath, specStatus }) => ({ sourcePath, specStatus })), [
    { sourcePath: 'mcp.json#mcpServers/malformed', specStatus: 'invalid' },
    { sourcePath: 'mcp.json#mcpServers/valid', specStatus: 'valid' },
    { sourcePath: 'skills/broken/SKILL.md', specStatus: 'invalid' },
    { sourcePath: 'skills/valid-sibling/SKILL.md', specStatus: 'valid' },
  ]);
  assert.equal(result.components[1].metadata.url, 'https://example.invalid/mcp');
  assert.equal(result.components[3].metadata.name, 'valid-sibling');
});

test('J: non-v1 component directories are ignored and optional SSE is explicit unsupported data', async () => {
  const result = await parsePlugin(fixture('j-unsupported-component-transport'));

  assert.equal(result.package.manifestStatus, 'valid');
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].metadata.type, 'sse');
  assert.equal(result.components[0].specStatus, 'unsupported');
  assert.equal(result.overall.unsupported, true);
  assert.equal(JSON.stringify(result).includes('commands/ignored.txt'), false);
});

test('K: all placeholders remain literal and no ambient credential value is observed', async () => {
  const previous = process.env.API_KEY;
  process.env.API_KEY = 'REAL_SECRET_SENTINEL';
  try {
    const first = await parsePlugin(fixture('k-literal-placeholders'));
    const serialized = JSON.stringify(first);

    assert.equal(serialized.includes('REAL_SECRET_SENTINEL'), false);
    assert.equal(first.components[0].metadata.args[0], '${API_KEY}');
    assert.equal(first.components[0].metadata.env.TOKEN, '${TOKEN}');
    assert.equal(first.security.placeholderExpansion, false);
    assert.equal(first.security.environmentAccess, false);
    assert.deepEqual([...new Set(first.security.placeholders.map(({ value }) => value))].sort(), [
      '${API_KEY}',
      '${HOME}',
      '${PLUGIN_DATA}',
      '${PLUGIN_ROOT}',
      '${TOKEN}',
      '${USERPROFILE}',
    ]);
  } finally {
    if (previous === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = previous;
  }
});

test('L: authority-claiming manifest and skill text are surfaced without becoming authority', async () => {
  const result = await parsePlugin(fixture('l-authority-claims'));

  assert.equal(result.overall.valid, true);
  assert.equal(result.security.authorityGranted, false);
  assert.deepEqual(result.security.authorityClaims.map(({ sourcePath, marker }) => ({ sourcePath, marker })), [
    { sourcePath: 'plugin.json#description', marker: 'bypass_policy' },
    { sourcePath: 'plugin.json#description', marker: 'run_automatically' },
    { sourcePath: 'plugin.json#description', marker: 'trusted' },
    { sourcePath: 'skills/claim-authority/SKILL.md', marker: 'bypass_policy' },
    { sourcePath: 'skills/claim-authority/SKILL.md', marker: 'execute' },
    { sourcePath: 'skills/claim-authority/SKILL.md', marker: 'promote_capability' },
    { sourcePath: 'skills/claim-authority/SKILL.md', marker: 'send' },
    { sourcePath: 'skills/claim-authority/SKILL.md', marker: 'write_memory' },
  ]);
  assert.equal(Object.hasOwn(result, 'trusted'), false);
  assert.equal(Object.hasOwn(result, 'authorized'), false);
});

test('M: a missing required root manifest is an explicit deterministic failure', async () => {
  const result = await parsePlugin(fixture('m-missing-manifest'));

  assert.equal(result.package.manifestStatus, 'missing');
  assert.equal(result.overall.status, 'invalid');
  assert.equal(result.overall.reviewable, false);
  assert.deepEqual(result.package.errors.map(({ code }) => code), ['manifest_missing']);
});

test('N: malformed manifest JSON is an explicit parse failure', async () => {
  const result = await parsePlugin(fixture('n-malformed-json'));

  assert.equal(result.package.manifestStatus, 'parse_failure');
  assert.equal(result.overall.status, 'parse_failure');
  assert.equal(result.overall.reviewable, false);
  assert.deepEqual(result.package.errors.map(({ code }) => code), ['manifest_json_malformed']);
});
