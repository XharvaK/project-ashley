import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { parseSkillFrontmatter, SKILL_LIMITS } from './skill-frontmatter.mjs';

const SPEC_VERSION = '1.0.0';
const PLUGIN_SCHEMA = `https://agent-plugins.org/schemas/${SPEC_VERSION}/plugin.schema.json`;
const MCP_SCHEMA = `https://agent-plugins.org/schemas/${SPEC_VERSION}/mcp.schema.json`;
export const PARSER_LIMITS = Object.freeze({
  components: 64,
  manifestBytes: 64 * 1024,
  mcpBytes: 256 * 1024,
  nestingDepth: SKILL_LIMITS.nestingDepth,
  skillAggregateBytes: 8 * 1024 * 1024,
  skillBytes: 256 * 1024,
});
const FILE_OPEN_FLAGS = fsConstants.O_RDONLY
  | (fsConstants.O_NONBLOCK ?? 0)
  | (process.platform === 'win32' ? 0 : (fsConstants.O_NOFOLLOW ?? 0));
const MANIFEST_FIELDS = new Set([
  '$schema',
  'author',
  'description',
  'extensions',
  'homepage',
  'keywords',
  'license',
  'name',
  'repository',
  'version',
]);
const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const PLACEHOLDER_PATTERN = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const AUTHORITY_MARKERS = [
  ['bypass_policy', /\b(?:bypass|ignore)\b[^\n.]{0,40}\bpolicy\b/i],
  ['execute', /\b(?:execute|shell commands?)\b/i],
  ['promote_capability', /\bpromote\b[^\n.]{0,40}\bcapabilit(?:y|ies)\b/i],
  ['run_automatically', /\brun\b[^\n.]{0,20}\bautomatically\b/i],
  ['send', /\bsend\b[^\n.]{0,40}\b(?:message|messages)\b/i],
  ['trusted', /\b(?:trusted|owner-approved)\b/i],
  ['write_memory', /\bwrite\b[^\n.]{0,20}\bmemory\b/i],
];

function diagnostic(category, code, sourcePath, message) {
  return { category, code, sourcePath, message };
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareDiagnostics(left, right) {
  return compareText(left.sourcePath, right.sourcePath)
    || compareText(left.code, right.code)
    || compareText(left.message, right.message);
}

function compareComponents(left, right) {
  return compareText(left.sourcePath, right.sourcePath) || compareText(left.kind, right.kind);
}

function isObject(value) {
  return value !== null && !Array.isArray(value) && typeof value === 'object';
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizedRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function schemaVersion(schema, kind) {
  if (typeof schema !== 'string') return null;
  const match = schema.match(new RegExp(`/schemas/([^/]+)/${kind}\\.schema\\.json$`));
  return match?.[1] ?? null;
}

function collectPlaceholders(value, sourcePath, output) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
      output.push({ sourcePath, value: match[0] });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPlaceholders(item, `${sourcePath}/${index}`, output));
    return;
  }
  if (isObject(value)) {
    for (const key of Object.keys(value).sort()) {
      collectPlaceholders(value[key], `${sourcePath}/${key}`, output);
    }
  }
}

function collectAuthorityClaims(text, sourcePath, output) {
  if (typeof text !== 'string') return;
  for (const [marker, pattern] of AUTHORITY_MARKERS) {
    if (pattern.test(text) && !output.some((claim) => claim.sourcePath === sourcePath && claim.marker === marker)) {
      output.push({ sourcePath, marker });
    }
  }
}

async function inspectContained(rootReal, relativePath, expectedKind) {
  const portable = relativePath.replaceAll('\\', '/');
  const lexical = path.resolve(rootReal, portable);
  if (!isContained(rootReal, lexical)) {
    return { status: 'rejected', reason: 'lexical_escape' };
  }
  try {
    const real = await fs.realpath(lexical);
    if (!isContained(rootReal, real)) return { status: 'rejected', reason: 'canonical_escape' };
    const stat = await fs.stat(real);
    if (expectedKind === 'file' && !stat.isFile()) return { status: 'invalid-kind', reason: 'not_regular_file' };
    if (expectedKind === 'directory' && !stat.isDirectory()) return { status: 'invalid-kind', reason: 'not_directory' };
    return { status: 'contained', path: real };
  } catch (cause) {
    if (cause?.code === 'ENOENT') return { status: 'missing' };
    return { status: 'unreadable', reason: cause?.code ?? 'filesystem_error' };
  }
}

async function readBounded(handle, maxBytes) {
  const chunks = [];
  let total = 0;
  while (total <= maxBytes) {
    const remaining = maxBytes + 1 - total;
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
    if (bytesRead === 0) break;
    chunks.push(buffer.subarray(0, bytesRead));
    total += bytesRead;
  }
  if (total > maxBytes) return { status: 'size-exceeded' };
  return { status: 'contained', content: Buffer.concat(chunks, total).toString('utf8') };
}

async function readContainedFile(rootReal, relativePath, maxBytes) {
  const portable = relativePath.replaceAll('\\', '/');
  const lexical = path.resolve(rootReal, portable);
  if (!isContained(rootReal, lexical)) return { status: 'rejected', reason: 'lexical_escape' };

  let handle;
  try {
    handle = await fs.open(lexical, FILE_OPEN_FLAGS);
    const openedStat = await handle.stat({ bigint: true });
    if (!openedStat.isFile()) return { status: 'invalid-kind', reason: 'not_regular_file' };

    const real = await fs.realpath(lexical);
    if (!isContained(rootReal, real)) return { status: 'rejected', reason: 'canonical_escape' };
    const currentStat = await fs.stat(real, { bigint: true });
    if (openedStat.dev !== currentStat.dev || openedStat.ino !== currentStat.ino) {
      return { status: 'rejected', reason: 'object_changed' };
    }
    if (openedStat.size > BigInt(maxBytes)) return { status: 'size-exceeded' };

    const read = await readBounded(handle, maxBytes);
    return read.status === 'contained' ? { status: 'contained', path: real, content: read.content } : read;
  } catch (cause) {
    if (cause?.code === 'ENOENT') return { status: 'missing' };
    return { status: 'unreadable', reason: cause?.code ?? 'filesystem_error' };
  } finally {
    await handle?.close().catch(() => {});
  }
}

function validateManifest(manifest) {
  const errors = [];
  let fatal = false;
  if (!isObject(manifest)) {
    return {
      errors: [diagnostic('spec_invalidity', 'manifest_type_invalid', 'plugin.json', 'Manifest must be a JSON object')],
      fatal: true,
    };
  }
  for (const key of Object.keys(manifest).sort()) {
    if (!MANIFEST_FIELDS.has(key)) {
      errors.push(diagnostic('spec_invalidity', 'manifest_unknown_field', `plugin.json#${key}`, `Unknown manifest field: ${key}`));
    }
  }
  if (typeof manifest.$schema !== 'string') {
    errors.push(diagnostic('spec_invalidity', 'manifest_schema_invalid', 'plugin.json#$schema', 'Manifest $schema must be a string'));
    fatal = true;
  }
  if (typeof manifest.name !== 'string' || manifest.name.length < 1 || manifest.name.length > 64 || !NAME_PATTERN.test(manifest.name)) {
    errors.push(diagnostic('spec_invalidity', 'manifest_name_invalid', 'plugin.json#name', 'Manifest name violates Agent Plugins v1 constraints'));
    fatal = true;
  }
  for (const field of ['version', 'description', 'homepage', 'repository', 'license']) {
    if (manifest[field] !== undefined && typeof manifest[field] !== 'string') {
      errors.push(diagnostic('spec_invalidity', `manifest_${field}_invalid`, `plugin.json#${field}`, `${field} must be a string`));
      fatal = true;
    }
  }
  if (manifest.keywords !== undefined && (!Array.isArray(manifest.keywords) || manifest.keywords.some((item) => typeof item !== 'string'))) {
    errors.push(diagnostic('spec_invalidity', 'manifest_keywords_invalid', 'plugin.json#keywords', 'keywords must be an array of strings'));
    fatal = true;
  }
  if (manifest.author !== undefined) {
    const validAuthor = isObject(manifest.author)
      && Object.keys(manifest.author).every((key) => ['name', 'email', 'url'].includes(key))
      && Object.values(manifest.author).every((value) => typeof value === 'string');
    if (!validAuthor) {
      errors.push(diagnostic('spec_invalidity', 'manifest_author_invalid', 'plugin.json#author', 'author must be a closed object of string fields'));
      fatal = true;
    }
  }
  if (manifest.extensions !== undefined && !isObject(manifest.extensions)) {
    errors.push(diagnostic('spec_invalidity', 'manifest_extensions_ignored', 'plugin.json#extensions', 'Non-object extensions field is ignored'));
  }
  return { errors: errors.sort(compareDiagnostics), fatal };
}

async function discoverSkills(rootReal, result) {
  const skills = await inspectContained(rootReal, 'skills', 'directory');
  if (skills.status === 'missing') return;
  if (skills.status !== 'contained') {
    const issue = diagnostic('ashley_containment_policy', 'skills_location_rejected', 'skills', `Skills location rejected: ${skills.reason ?? skills.status}`);
    result.security.pathViolations.push(issue);
    result.components.push({
      kind: 'skills',
      sourcePath: 'skills',
      specStatus: 'invalid',
      containmentStatus: 'rejected',
      metadata: null,
      content: null,
      errors: [issue],
    });
    return;
  }

  const entries = [];
  try {
    const directory = await fs.opendir(skills.path);
    for await (const entry of directory) {
      entries.push(entry);
      if (entries.length > PARSER_LIMITS.components) break;
    }
  } catch (cause) {
    const issue = diagnostic('parse_failure', 'skills_unreadable', 'skills', `Skills directory is unreadable: ${cause?.code ?? 'filesystem_error'}`);
    result.components.push({
      kind: 'skills',
      sourcePath: 'skills',
      specStatus: 'parse_failure',
      containmentStatus: 'contained',
      metadata: null,
      content: null,
      errors: [issue],
    });
    return;
  }
  if (entries.length > PARSER_LIMITS.components) {
    result.components.push({
      kind: 'skills',
      sourcePath: 'skills',
      specStatus: 'invalid',
      containmentStatus: 'contained',
      metadata: null,
      content: null,
      errors: [diagnostic('ashley_resource_policy', 'skill_limit_exceeded', 'skills', `Skills directory exceeds the ${PARSER_LIMITS.components}-component parser budget`)],
    });
    return;
  }
  let retainedSkillBytes = 0;
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const skillDirectory = `skills/${entry.name}`;
    const directory = await inspectContained(rootReal, skillDirectory, 'directory');
    const skillPath = `${skillDirectory}/SKILL.md`;
    if (directory.status !== 'contained') {
      if (directory.status !== 'missing' && directory.status !== 'invalid-kind') {
        const issue = diagnostic('ashley_containment_policy', 'skill_path_rejected', skillPath, `Skill path rejected: ${directory.reason ?? directory.status}`);
        result.security.pathViolations.push(issue);
        result.components.push({
          kind: 'skill',
          sourcePath: skillPath,
          specStatus: 'invalid',
          containmentStatus: 'rejected',
          metadata: null,
          content: null,
          errors: [issue],
        });
      }
      continue;
    }
    const skillFile = await readContainedFile(rootReal, skillPath, PARSER_LIMITS.skillBytes);
    if (skillFile.status === 'missing') continue;
    if (skillFile.status !== 'contained') {
      const oversized = skillFile.status === 'size-exceeded';
      const issue = oversized
        ? diagnostic('ashley_resource_policy', 'skill_size_exceeded', skillPath, `SKILL.md exceeds the ${PARSER_LIMITS.skillBytes}-byte parser budget`)
        : diagnostic('ashley_containment_policy', 'skill_path_rejected', skillPath, `Skill path rejected: ${skillFile.reason ?? skillFile.status}`);
      if (!oversized) result.security.pathViolations.push(issue);
      result.components.push({
        kind: 'skill',
        sourcePath: skillPath,
        specStatus: 'invalid',
        containmentStatus: oversized ? 'contained' : 'rejected',
        metadata: null,
        content: null,
        errors: [issue],
      });
      continue;
    }
    const skillBytes = Buffer.byteLength(skillFile.content, 'utf8');
    if (retainedSkillBytes + skillBytes > PARSER_LIMITS.skillAggregateBytes) {
      result.components.push({
        kind: 'skill',
        sourcePath: skillPath,
        specStatus: 'invalid',
        containmentStatus: 'contained',
        metadata: null,
        content: null,
        errors: [diagnostic('ashley_resource_policy', 'skill_aggregate_size_exceeded', skillPath, `Package skill text exceeds the ${PARSER_LIMITS.skillAggregateBytes}-byte aggregate parser budget`)],
      });
      continue;
    }
    retainedSkillBytes += skillBytes;
    const parsed = parseSkillFrontmatter(skillFile.content, entry.name);
    const errors = parsed.errors.map((issue) => diagnostic('spec_invalidity', issue.code, skillPath, issue.message));
    result.components.push({
      kind: 'skill',
      sourcePath: skillPath,
      specStatus: errors.length === 0 ? 'valid' : 'invalid',
      containmentStatus: 'contained',
      metadata: parsed.metadata ?? null,
      content: parsed.body,
      errors: errors.sort(compareDiagnostics),
    });
    collectAuthorityClaims(
      [parsed.metadata?.description, parsed.metadata?.allowedTools, parsed.body].filter(Boolean).join('\n'),
      skillPath,
      result.security.authorityClaims,
    );
  }
}

function normalizedStringMap(value) {
  if (!isObject(value) || Object.values(value).some((item) => typeof item !== 'string')) return undefined;
  return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, value[key]]));
}

function normalizeServer(server) {
  if (!isObject(server)) return null;
  const metadata = {};
  if (typeof server.type === 'string') metadata.type = server.type;
  if (server.type === 'stdio') {
    if (typeof server.command === 'string') metadata.command = server.command;
    if (Array.isArray(server.args) && server.args.every((value) => typeof value === 'string')) metadata.args = [...server.args];
    const env = normalizedStringMap(server.env);
    if (env !== undefined) metadata.env = env;
    if (typeof server.cwd === 'string') metadata.cwd = server.cwd;
  } else if (server.type === 'streamable-http' || server.type === 'sse') {
    if (typeof server.url === 'string') metadata.url = server.url;
    const headers = normalizedStringMap(server.headers);
    if (headers !== undefined) metadata.headers = headers;
  }
  return metadata;
}

function validateHttpServer(server, sourcePath) {
  const errors = [];
  const allowed = new Set(['type', 'url', 'headers']);
  for (const key of Object.keys(server).sort()) {
    if (!allowed.has(key)) errors.push(diagnostic('spec_invalidity', 'mcp_server_unknown_field', `${sourcePath}/${key}`, `Unknown ${server.type} server field: ${key}`));
  }
  if (typeof server.url !== 'string') {
    errors.push(diagnostic('spec_invalidity', 'mcp_url_invalid', `${sourcePath}/url`, 'MCP URL must be a string'));
  } else {
    try {
      const url = new URL(server.url);
      const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || (url.protocol === 'http:' && !loopback)) {
        errors.push(diagnostic('spec_invalidity', 'mcp_url_invalid', `${sourcePath}/url`, 'MCP URL violates Agent Plugins transport URL constraints'));
      }
    } catch {
      errors.push(diagnostic('spec_invalidity', 'mcp_url_invalid', `${sourcePath}/url`, 'MCP URL must be absolute'));
    }
  }
  if (server.headers !== undefined) {
    if (!isObject(server.headers) || Object.values(server.headers).some((value) => typeof value !== 'string')) {
      errors.push(diagnostic('spec_invalidity', 'mcp_headers_invalid', `${sourcePath}/headers`, 'MCP headers must be a string mapping'));
    } else {
      const seen = new Set();
      for (const name of Object.keys(server.headers)) {
        const normalized = name.toLowerCase();
        if (seen.has(normalized)) errors.push(diagnostic('spec_invalidity', 'mcp_header_duplicate', `${sourcePath}/headers/${name}`, 'MCP header names must be case-insensitively unique'));
        seen.add(normalized);
      }
    }
  }
  return errors;
}

async function validateStdioServer(rootReal, server, sourcePath) {
  const errors = [];
  let containmentStatus = 'not-applicable';
  const allowed = new Set(['type', 'command', 'args', 'env', 'cwd']);
  for (const key of Object.keys(server).sort()) {
    if (!allowed.has(key)) errors.push(diagnostic('spec_invalidity', 'mcp_server_unknown_field', `${sourcePath}/${key}`, `Unknown stdio server field: ${key}`));
  }
  if (typeof server.command !== 'string' || server.command.length === 0) {
    errors.push(diagnostic('spec_invalidity', 'mcp_command_invalid', `${sourcePath}/command`, 'stdio command must be a non-empty executable token'));
  } else if (server.command.startsWith('./') || server.command.startsWith('.\\')) {
    const command = await inspectContained(rootReal, server.command, 'file');
    containmentStatus = command.status === 'contained' ? 'contained' : 'rejected';
    if (command.status !== 'contained') errors.push(diagnostic('ashley_containment_policy', 'mcp_command_rejected', `${sourcePath}/command`, `stdio command rejected: ${command.reason ?? command.status}`));
  } else if (!/^[A-Za-z0-9._-]+$/.test(server.command) || /^[A-Za-z]:/.test(server.command)) {
    containmentStatus = 'rejected';
    errors.push(diagnostic('ashley_containment_policy', 'mcp_command_rejected', `${sourcePath}/command`, 'stdio command must be a bare name or contained ./ plugin-relative path'));
  }
  if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some((value) => typeof value !== 'string'))) {
    errors.push(diagnostic('spec_invalidity', 'mcp_args_invalid', `${sourcePath}/args`, 'stdio args must be an array of strings'));
  }
  if (server.env !== undefined) {
    if (!isObject(server.env) || Object.values(server.env).some((value) => typeof value !== 'string')) {
      errors.push(diagnostic('spec_invalidity', 'mcp_env_invalid', `${sourcePath}/env`, 'stdio env must be a string mapping'));
    } else if (Object.hasOwn(server.env, 'PLUGIN_ROOT') || Object.hasOwn(server.env, 'PLUGIN_DATA')) {
      errors.push(diagnostic('spec_invalidity', 'mcp_env_reserved', `${sourcePath}/env`, 'PLUGIN_ROOT and PLUGIN_DATA are reserved'));
    }
  }
  if (server.cwd !== undefined) {
    if (typeof server.cwd !== 'string') {
      errors.push(diagnostic('spec_invalidity', 'mcp_cwd_invalid', `${sourcePath}/cwd`, 'stdio cwd must be a string'));
    } else if (server.cwd === '${PLUGIN_ROOT}' || server.cwd.startsWith('${PLUGIN_ROOT}/')) {
      const suffix = server.cwd.slice('${PLUGIN_ROOT}'.length).replace(/^\//, '') || '.';
      const cwd = await inspectContained(rootReal, suffix, 'directory');
      containmentStatus = cwd.status === 'contained' ? 'contained' : 'rejected';
      if (cwd.status !== 'contained') errors.push(diagnostic('ashley_containment_policy', 'mcp_cwd_rejected', `${sourcePath}/cwd`, `stdio cwd rejected: ${cwd.reason ?? cwd.status}`));
    } else if (server.cwd === '${PLUGIN_DATA}' || server.cwd.startsWith('${PLUGIN_DATA}/')) {
      const suffix = server.cwd.slice('${PLUGIN_DATA}'.length).replace(/^\//, '').replaceAll('\\', '/');
      if (suffix.split('/').includes('..')) {
        containmentStatus = 'rejected';
        errors.push(diagnostic('ashley_containment_policy', 'mcp_cwd_rejected', `${sourcePath}/cwd`, 'PLUGIN_DATA cwd must not traverse'));
      }
    } else if (server.cwd.startsWith('./') || server.cwd.startsWith('.\\')) {
      const cwd = await inspectContained(rootReal, server.cwd, 'directory');
      containmentStatus = cwd.status === 'contained' ? 'contained' : 'rejected';
      if (cwd.status !== 'contained') errors.push(diagnostic('ashley_containment_policy', 'mcp_cwd_rejected', `${sourcePath}/cwd`, `stdio cwd rejected: ${cwd.reason ?? cwd.status}`));
    } else {
      containmentStatus = 'rejected';
      errors.push(diagnostic('ashley_containment_policy', 'mcp_cwd_rejected', `${sourcePath}/cwd`, 'stdio cwd must use an allowed contained plugin variable or ./ path'));
    }
  }
  return { errors, containmentStatus };
}

async function discoverMcp(rootReal, manifestVersion, result) {
  const mcpFile = await readContainedFile(rootReal, 'mcp.json', PARSER_LIMITS.mcpBytes);
  if (mcpFile.status === 'missing') return;
  if (mcpFile.status !== 'contained') {
    const oversized = mcpFile.status === 'size-exceeded';
    const issue = oversized
      ? diagnostic('ashley_resource_policy', 'mcp_size_exceeded', 'mcp.json', `mcp.json exceeds the ${PARSER_LIMITS.mcpBytes}-byte parser budget`)
      : diagnostic('ashley_containment_policy', 'mcp_location_rejected', 'mcp.json', `MCP location rejected: ${mcpFile.reason ?? mcpFile.status}`);
    if (!oversized) result.security.pathViolations.push(issue);
    result.components.push({ kind: 'mcp-config', sourcePath: 'mcp.json', specStatus: 'invalid', containmentStatus: oversized ? 'contained' : 'rejected', metadata: null, errors: [issue] });
    return;
  }

  let config;
  try {
    config = JSON.parse(mcpFile.content);
  } catch {
    result.components.push({
      kind: 'mcp-config',
      sourcePath: 'mcp.json',
      specStatus: 'parse_failure',
      containmentStatus: 'contained',
      metadata: null,
      errors: [diagnostic('parse_failure', 'mcp_json_malformed', 'mcp.json', 'MCP configuration is not valid JSON')],
    });
    return;
  }
  if (!isObject(config) || typeof config.$schema !== 'string' || !isObject(config.mcpServers) || Object.keys(config).some((key) => !['$schema', 'mcpServers'].includes(key))) {
    result.components.push({
      kind: 'mcp-config',
      sourcePath: 'mcp.json',
      specStatus: 'invalid',
      containmentStatus: 'contained',
      metadata: null,
      errors: [diagnostic('spec_invalidity', 'mcp_config_invalid', 'mcp.json', 'MCP configuration violates its closed top-level schema')],
    });
    return;
  }
  const mcpVersion = schemaVersion(config.$schema, 'mcp');
  if (config.$schema !== MCP_SCHEMA || mcpVersion !== manifestVersion) {
    result.components.push({
      kind: 'mcp-config',
      sourcePath: 'mcp.json',
      specStatus: config.$schema === MCP_SCHEMA ? 'invalid' : 'unsupported',
      containmentStatus: 'contained',
      metadata: { claimedSchema: config.$schema, specVersion: mcpVersion },
      errors: [diagnostic(config.$schema === MCP_SCHEMA ? 'spec_invalidity' : 'unsupported_version', 'mcp_version_mismatch', 'mcp.json#$schema', 'MCP schema version must match plugin.json')],
    });
    return;
  }

  if (Object.keys(config.mcpServers).length > PARSER_LIMITS.components) {
    result.components.push({
      kind: 'mcp-config',
      sourcePath: 'mcp.json',
      specStatus: 'invalid',
      containmentStatus: 'contained',
      metadata: null,
      errors: [diagnostic('ashley_resource_policy', 'mcp_server_limit_exceeded', 'mcp.json#mcpServers', `MCP configuration exceeds the ${PARSER_LIMITS.components}-server parser budget`)],
    });
    return;
  }

  for (const serverName of Object.keys(config.mcpServers).sort(compareText)) {
    const server = config.mcpServers[serverName];
    const sourcePath = `mcp.json#mcpServers/${serverName}`;
    const errors = [];
    let containmentStatus = 'not-applicable';
    let specStatus = 'valid';
    if (!isObject(server) || typeof server.type !== 'string') {
      errors.push(diagnostic('spec_invalidity', 'mcp_server_invalid', sourcePath, 'MCP server must be an object with a type'));
    } else if (server.type === 'stdio') {
      const validation = await validateStdioServer(rootReal, server, sourcePath);
      errors.push(...validation.errors);
      containmentStatus = validation.containmentStatus;
    } else if (server.type === 'streamable-http' || server.type === 'sse') {
      errors.push(...validateHttpServer(server, sourcePath));
      if (server.type === 'sse' && errors.length === 0) specStatus = 'unsupported';
    } else {
      specStatus = 'invalid';
      errors.push(diagnostic('spec_invalidity', 'mcp_transport_unknown', `${sourcePath}/type`, `Unknown MCP transport: ${server.type}`));
    }
    if (errors.length > 0) specStatus = 'invalid';
    const metadata = normalizeServer(server);
    collectPlaceholders(metadata, sourcePath, result.security.placeholders);
    result.components.push({
      kind: 'mcp-server',
      sourcePath,
      specStatus,
      containmentStatus,
      metadata,
      errors: errors.sort(compareDiagnostics),
    });
  }
}

function finalize(result, discoverable) {
  result.package.errors.sort(compareDiagnostics);
  result.components.sort(compareComponents);
  for (const component of result.components) {
    for (const issue of component.errors.filter((candidate) => candidate.category === 'ashley_containment_policy')) {
      if (!result.security.pathViolations.some((existing) => existing.code === issue.code && existing.sourcePath === issue.sourcePath)) {
        result.security.pathViolations.push(issue);
      }
    }
  }
  result.security.pathViolations.sort(compareDiagnostics);
  result.security.placeholders.sort((left, right) => compareText(left.sourcePath, right.sourcePath) || compareText(left.value, right.value));
  result.security.authorityClaims.sort((left, right) => compareText(left.sourcePath, right.sourcePath) || compareText(left.marker, right.marker));
  const componentStatuses = result.components.map((component) => component.specStatus);
  const invalid = ['invalid', 'missing', 'parse_failure'].includes(result.package.manifestStatus) || componentStatuses.some((status) => ['invalid', 'parse_failure'].includes(status));
  const unsupported = result.package.manifestStatus === 'unsupported' || componentStatuses.includes('unsupported');
  result.overall = {
    valid: result.package.manifestStatus === 'valid' && !invalid && !unsupported,
    invalid,
    unsupported,
    quarantined: true,
    reviewable: discoverable && result.package.manifestStatus !== 'unsupported',
    status: result.package.manifestStatus === 'parse_failure' ? 'parse_failure' : invalid ? 'invalid' : unsupported ? 'unsupported' : 'valid',
  };
  return result;
}

function initialResult() {
  return {
    format: 'ashley-agent-plugin-quarantine/v1',
    package: {
      root: '.',
      claimedSchema: null,
      specVersion: null,
      manifestStatus: 'missing',
      errors: [],
    },
    components: [],
    security: {
      authorityClaims: [],
      authorityGranted: false,
      environmentAccess: false,
      networkAccess: false,
      pathViolations: [],
      placeholderExpansion: false,
      placeholders: [],
      processSpawned: false,
    },
    overall: null,
  };
}

export async function parsePlugin(packageRoot) {
  const result = initialResult();
  let rootReal;
  try {
    rootReal = await fs.realpath(path.resolve(packageRoot));
    const stat = await fs.stat(rootReal);
    if (!stat.isDirectory()) throw new Error('not_directory');
  } catch {
    result.package.errors.push(diagnostic('parse_failure', 'package_root_invalid', '.', 'Package root must be a readable directory'));
    result.package.manifestStatus = 'parse_failure';
    return finalize(result, false);
  }

  const manifestFile = await readContainedFile(rootReal, 'plugin.json', PARSER_LIMITS.manifestBytes);
  if (manifestFile.status === 'missing') {
    result.package.errors.push(diagnostic('parse_failure', 'manifest_missing', 'plugin.json', 'Required root plugin.json is missing'));
    return finalize(result, false);
  }
  if (manifestFile.status !== 'contained') {
    const oversized = manifestFile.status === 'size-exceeded';
    const issue = oversized
      ? diagnostic('ashley_resource_policy', 'manifest_size_exceeded', 'plugin.json', `plugin.json exceeds the ${PARSER_LIMITS.manifestBytes}-byte parser budget`)
      : diagnostic('ashley_containment_policy', 'manifest_path_rejected', 'plugin.json', `Manifest path rejected: ${manifestFile.reason ?? manifestFile.status}`);
    result.package.errors.push(issue);
    if (!oversized) result.security.pathViolations.push(issue);
    result.package.manifestStatus = 'invalid';
    return finalize(result, false);
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestFile.content);
  } catch {
    result.package.errors.push(diagnostic('parse_failure', 'manifest_json_malformed', 'plugin.json', 'Manifest is not valid JSON'));
    result.package.manifestStatus = 'parse_failure';
    return finalize(result, false);
  }
  result.package.claimedSchema = isObject(manifest) && typeof manifest.$schema === 'string' ? manifest.$schema : null;
  result.package.specVersion = schemaVersion(result.package.claimedSchema, 'plugin');
  const validation = validateManifest(manifest);
  result.package.errors.push(...validation.errors);
  if (result.package.claimedSchema !== PLUGIN_SCHEMA) {
    result.package.errors.push(diagnostic('unsupported_version', 'manifest_unsupported_version', 'plugin.json#$schema', 'Manifest targets an unsupported Agent Plugins version'));
    result.package.manifestStatus = 'unsupported';
    return finalize(result, false);
  }
  if (validation.fatal) {
    result.package.manifestStatus = 'invalid';
    return finalize(result, false);
  }
  result.package.manifestStatus = validation.errors.length === 0 ? 'valid' : 'invalid';
  collectAuthorityClaims(manifest.description, 'plugin.json#description', result.security.authorityClaims);
  await discoverSkills(rootReal, result);
  await discoverMcp(rootReal, result.package.specVersion, result);
  return finalize(result, true);
}
