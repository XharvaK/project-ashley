import assert from 'node:assert/strict';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PARSER_LIMITS, parsePlugin } from '../src/parser.mjs';
import { parseSkillFrontmatter } from '../src/skill-frontmatter.mjs';

const pluginSchema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const mcpSchema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

async function temporaryPackage(t, name = 'security-regression') {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ashley-p02-security-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const packageRoot = path.join(temporary, 'package');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'plugin.json'), JSON.stringify({
    $schema: pluginSchema,
    name,
  }), 'utf8');
  return { packageRoot, temporary };
}

test('security: drive-relative commands and mixed PLUGIN_DATA traversal fail portable containment', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'portable-paths');
  await fs.writeFile(path.join(packageRoot, 'mcp.json'), JSON.stringify({
    $schema: mcpSchema,
    mcpServers: {
      'drive-relative': { type: 'stdio', command: 'C:tool.exe' },
      'plugin-data-escape': { type: 'stdio', command: 'tool', cwd: '${PLUGIN_DATA}/safe\\..\\..\\outside' },
    },
  }), 'utf8');

  const result = await parsePlugin(packageRoot);

  assert.deepEqual(result.components.map(({ sourcePath, specStatus, containmentStatus, errors }) => ({
    sourcePath,
    specStatus,
    containmentStatus,
    codes: errors.map(({ code }) => code),
  })), [
    {
      sourcePath: 'mcp.json#mcpServers/drive-relative',
      specStatus: 'invalid',
      containmentStatus: 'rejected',
      codes: ['mcp_command_rejected'],
    },
    {
      sourcePath: 'mcp.json#mcpServers/plugin-data-escape',
      specStatus: 'invalid',
      containmentStatus: 'rejected',
      codes: ['mcp_cwd_rejected'],
    },
  ]);
});

test('security: files larger than the explicit parser budgets fail closed', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'oversize-manifest');
  await fs.writeFile(
    path.join(packageRoot, 'plugin.json'),
    `${JSON.stringify({ $schema: pluginSchema, name: 'oversize-manifest' })}${' '.repeat(PARSER_LIMITS.manifestBytes + 1)}`,
    'utf8',
  );

  const result = await parsePlugin(packageRoot);

  assert.equal(result.package.manifestStatus, 'invalid');
  assert.deepEqual(result.package.errors.map(({ code }) => code), ['manifest_size_exceeded']);
  assert.equal(result.overall.reviewable, false);
});

test('security: MCP and skill file byte budgets produce component-local failures', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'component-byte-budgets');
  const skillRoot = path.join(packageRoot, 'skills', 'oversize');
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(path.join(skillRoot, 'SKILL.md'), 'x'.repeat(PARSER_LIMITS.skillBytes + 1), 'utf8');
  await fs.writeFile(path.join(packageRoot, 'mcp.json'), ' '.repeat(PARSER_LIMITS.mcpBytes + 1), 'utf8');

  const result = await parsePlugin(packageRoot);

  assert.deepEqual(result.components.map(({ sourcePath, errors }) => ({
    sourcePath,
    codes: errors.map(({ code }) => code),
  })), [
    { sourcePath: 'mcp.json', codes: ['mcp_size_exceeded'] },
    { sourcePath: 'skills/oversize/SKILL.md', codes: ['skill_size_exceeded'] },
  ]);
});

test('security: file opens request nonblocking and Linux no-follow semantics before type validation', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'safe-open-flags');
  const originalOpen = fs.open;
  const observedFlags = [];
  fs.open = async (candidate, flags, ...args) => {
    observedFlags.push(flags);
    return originalOpen(candidate, flags, ...args);
  };
  t.after(() => { fs.open = originalOpen; });

  await parsePlugin(packageRoot);

  assert.ok(observedFlags.length > 0);
  assert.ok(observedFlags.every((flags) => Number.isInteger(flags)));
  if (process.platform !== 'win32') {
    assert.ok(observedFlags.every((flags) => (flags & fsConstants.O_NONBLOCK) === fsConstants.O_NONBLOCK));
    assert.ok(observedFlags.every((flags) => (flags & fsConstants.O_NOFOLLOW) === fsConstants.O_NOFOLLOW));
  }
});

test('security: aggregate retained skill text has a package-level ceiling', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'aggregate-skill-budget');
  const skillsRoot = path.join(packageRoot, 'skills');
  const skillCount = Math.floor(PARSER_LIMITS.skillAggregateBytes / PARSER_LIMITS.skillBytes) + 1;
  const prefix = (name) => `---\nname: ${name}\ndescription: bounded fixture\n---\n`;
  for (let index = 0; index < skillCount; index += 1) {
    const name = `skill-${String(index).padStart(2, '0')}`;
    const directory = path.join(skillsRoot, name);
    await fs.mkdir(directory, { recursive: true });
    const header = prefix(name);
    await fs.writeFile(path.join(directory, 'SKILL.md'), `${header}${'x'.repeat(PARSER_LIMITS.skillBytes - Buffer.byteLength(header))}`, 'utf8');
  }

  const result = await parsePlugin(packageRoot);

  assert.equal(result.components.length, skillCount);
  assert.deepEqual(
    result.components.filter(({ errors }) => errors.some(({ code }) => code === 'skill_aggregate_size_exceeded')).map(({ sourcePath }) => sourcePath),
    [`skills/skill-${String(skillCount - 1).padStart(2, '0')}/SKILL.md`],
  );
});

test('security: excessive skill-directory cardinality fails before component reads', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'skill-count-budget');
  const skillsRoot = path.join(packageRoot, 'skills');
  for (let index = 0; index <= PARSER_LIMITS.components; index += 1) {
    await fs.mkdir(path.join(skillsRoot, `skill-${String(index).padStart(2, '0')}`), { recursive: true });
  }

  const result = await parsePlugin(packageRoot);

  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].kind, 'skills');
  assert.deepEqual(result.components[0].errors.map(({ code }) => code), ['skill_limit_exceeded']);
});

test('security: excessive MCP server cardinality is a deterministic component failure', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'server-budget');
  const mcpServers = Object.fromEntries(
    Array.from({ length: PARSER_LIMITS.components + 1 }, (_, index) => [
      `server-${String(index).padStart(3, '0')}`,
      { type: 'streamable-http', url: 'https://example.invalid/mcp' },
    ]),
  );
  await fs.writeFile(path.join(packageRoot, 'mcp.json'), JSON.stringify({ $schema: mcpSchema, mcpServers }), 'utf8');

  const result = await parsePlugin(packageRoot);

  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].kind, 'mcp-config');
  assert.equal(result.components[0].specStatus, 'invalid');
  assert.deepEqual(result.components[0].errors.map(({ code }) => code), ['mcp_server_limit_exceeded']);
});

test('security: deeply nested unknown MCP data cannot overflow placeholder collection', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'bounded-json-walk');
  const depth = PARSER_LIMITS.nestingDepth * 200;
  const nested = `${'['.repeat(depth)}"${'${SECRET}'}"${']'.repeat(depth)}`;
  await fs.writeFile(
    path.join(packageRoot, 'mcp.json'),
    `{"$schema":"${mcpSchema}","mcpServers":{"nested":{"type":"stdio","command":"tool","unknown":${nested}}}}`,
    'utf8',
  );

  const result = await parsePlugin(packageRoot);

  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].specStatus, 'invalid');
  assert.deepEqual(result.components[0].errors.map(({ code }) => code), ['mcp_server_unknown_field']);
  assert.equal(Object.hasOwn(result.components[0].metadata, 'unknown'), false);
  assert.deepEqual(result.security.placeholders, []);
});

test('security: YAML complexity is bounded before object conversion', () => {
  const yamlDepth = PARSER_LIMITS.nestingDepth + 1;
  const yaml = Array.from({ length: yamlDepth }, (_, index) => `${'  '.repeat(index)}level-${index}:`).join('\n');
  const content = `---\nname: bounded-yaml\ndescription: bounded\n${yaml}\n---\nbody`;

  const result = parseSkillFrontmatter(content, 'bounded-yaml');

  assert.deepEqual(result.errors.map(({ code }) => code), ['skill_yaml_too_complex']);
});

test('security: YAML node and alias budgets fail deterministically', () => {
  const excessiveNodes = Array.from({ length: 2050 }, (_, index) => `unknown-${index}: value`).join('\n');
  const nodeResult = parseSkillFrontmatter(`---\nname: node-budget\ndescription: bounded\n${excessiveNodes}\n---\nbody`, 'node-budget');
  const aliases = Array.from({ length: 101 }, () => '*value').join(', ');
  const aliasResult = parseSkillFrontmatter(`---\nname: alias-budget\ndescription: bounded\nvalue: &value x\nbomb: [${aliases}]\n---\nbody`, 'alias-budget');

  assert.deepEqual(nodeResult.errors.map(({ code }) => code), ['skill_yaml_too_complex']);
  assert.deepEqual(aliasResult.errors.map(({ code }) => code), ['skill_yaml_invalid']);
});

test('security: a file handle not matching the checked contained path is rejected before reading', async (t) => {
  const { packageRoot, temporary } = await temporaryPackage(t, 'handle-binding');
  const outside = path.join(temporary, 'outside.json');
  await fs.writeFile(outside, JSON.stringify({
    $schema: pluginSchema,
    name: 'outside-sentinel',
    description: 'OUTSIDE_HANDLE_SENTINEL',
  }), 'utf8');
  const originalOpen = fs.open;
  fs.open = async (candidate, ...args) => (
    path.basename(String(candidate)) === 'plugin.json'
      ? originalOpen(outside, ...args)
      : originalOpen(candidate, ...args)
  );
  t.after(() => { fs.open = originalOpen; });

  const result = await parsePlugin(packageRoot);

  assert.equal(result.package.manifestStatus, 'invalid');
  assert.deepEqual(result.package.errors.map(({ code }) => code), ['manifest_path_rejected']);
  assert.equal(JSON.stringify(result).includes('OUTSIDE_HANDLE_SENTINEL'), false);
});

test('security: normalized MCP metadata drops unknown prototype-like keys', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'closed-metadata');
  await fs.writeFile(
    path.join(packageRoot, 'mcp.json'),
    `{"$schema":"${mcpSchema}","mcpServers":{"closed":{"type":"stdio","command":"tool","__proto__":{"polluted":true}}}}`,
    'utf8',
  );

  const result = await parsePlugin(packageRoot);

  assert.equal(result.components[0].specStatus, 'invalid');
  assert.equal(Object.hasOwn(result.components[0].metadata, '__proto__'), false);
  assert.equal({}.polluted, undefined);
});

test('determinism: attacker-controlled names use locale-independent ordinal order', async (t) => {
  const { packageRoot } = await temporaryPackage(t, 'portable-order');
  await fs.writeFile(path.join(packageRoot, 'mcp.json'), JSON.stringify({
    $schema: mcpSchema,
    mcpServers: {
      'ä': { type: 'streamable-http', url: 'https://example.invalid/mcp' },
      z: { type: 'streamable-http', url: 'https://example.invalid/mcp' },
      a: { type: 'streamable-http', url: 'https://example.invalid/mcp' },
    },
  }), 'utf8');

  const result = await parsePlugin(packageRoot);

  assert.deepEqual(result.components.map(({ sourcePath }) => sourcePath), [
    'mcp.json#mcpServers/a',
    'mcp.json#mcpServers/z',
    'mcp.json#mcpServers/ä',
  ]);
});
