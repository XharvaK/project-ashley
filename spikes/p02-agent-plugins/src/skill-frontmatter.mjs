import { parseDocument } from 'yaml';

const ALLOWED_FIELDS = new Set([
  'allowed-tools',
  'compatibility',
  'description',
  'license',
  'metadata',
  'name',
]);
const NAME_PATTERN = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const SKILL_LIMITS = Object.freeze({
  frontmatterBytes: 64 * 1024,
  nestingDepth: 64,
  yamlNodes: 2048,
});

function error(code, message) {
  return { code, message };
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function yamlComplexityWithinLimits(contents) {
  const seen = new Set();
  const stack = [{ node: contents, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { node, depth } = stack.pop();
    if (node === null || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    nodes += 1;
    if (nodes > SKILL_LIMITS.yamlNodes || depth > SKILL_LIMITS.nestingDepth) return false;
    if (Array.isArray(node.items)) {
      for (const item of node.items) stack.push({ node: item, depth: depth + 1 });
    }
    if (Object.hasOwn(node, 'key')) stack.push({ node: node.key, depth: depth + 1 });
    if (Object.hasOwn(node, 'value')) stack.push({ node: node.value, depth: depth + 1 });
  }
  return true;
}

function splitFrontmatter(content) {
  const normalized = content.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) {
    return { errors: [error('skill_frontmatter_missing', 'SKILL.md must begin with YAML frontmatter')], body: '' };
  }
  const closing = normalized.indexOf('\n---\n', 4);
  if (closing === -1) {
    return { errors: [error('skill_frontmatter_unclosed', 'SKILL.md YAML frontmatter is not closed')], body: '' };
  }
  return {
    yaml: normalized.slice(4, closing),
    body: normalized.slice(closing + 5).trim(),
    errors: [],
  };
}

export function parseSkillFrontmatter(content, directoryName) {
  const split = splitFrontmatter(content);
  if (split.errors.length > 0) return split;
  if (Buffer.byteLength(split.yaml, 'utf8') > SKILL_LIMITS.frontmatterBytes) {
    return { body: split.body, errors: [error('skill_frontmatter_size_exceeded', 'Skill frontmatter exceeds the parser byte budget')] };
  }

  let document;
  try {
    document = parseDocument(split.yaml, {
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
    });
  } catch (cause) {
    return { body: split.body, errors: [error('skill_yaml_invalid', cause.message)] };
  }
  if (document.errors.length > 0) {
    return {
      body: split.body,
      errors: document.errors.map((issue) => error('skill_yaml_invalid', issue.message)),
    };
  }
  if (!yamlComplexityWithinLimits(document.contents)) {
    return { body: split.body, errors: [error('skill_yaml_too_complex', 'Skill frontmatter exceeds the parser nesting or node budget')] };
  }

  let data;
  try {
    data = document.toJS({ maxAliasCount: 100 });
  } catch (cause) {
    return { body: split.body, errors: [error('skill_yaml_invalid', cause.message)] };
  }

  if (data === null || Array.isArray(data) || typeof data !== 'object') {
    return { body: split.body, errors: [error('skill_frontmatter_type', 'Skill frontmatter must be a mapping')] };
  }

  const errors = [];
  for (const key of Object.keys(data).sort()) {
    if (!ALLOWED_FIELDS.has(key)) {
      errors.push(error('skill_unknown_field', `Unknown Agent Skills frontmatter field: ${key}`));
    }
  }

  if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 64 || !NAME_PATTERN.test(data.name)) {
    errors.push(error('skill_name_invalid', 'Skill name must satisfy the Agent Skills naming constraints'));
  } else if (data.name !== directoryName) {
    errors.push(error('skill_name_mismatch', 'Skill name must match its parent directory'));
  }
  if (typeof data.description !== 'string' || data.description.length < 1 || data.description.length > 1024) {
    errors.push(error('skill_description_invalid', 'Skill description must be a non-empty string of at most 1024 characters'));
  }
  if (data.license !== undefined && typeof data.license !== 'string') {
    errors.push(error('skill_license_invalid', 'Skill license must be a string'));
  }
  if (
    data.compatibility !== undefined
    && (typeof data.compatibility !== 'string' || data.compatibility.length < 1 || data.compatibility.length > 500)
  ) {
    errors.push(error('skill_compatibility_invalid', 'Skill compatibility must be a non-empty string of at most 500 characters'));
  }
  if (data['allowed-tools'] !== undefined && typeof data['allowed-tools'] !== 'string') {
    errors.push(error('skill_allowed_tools_invalid', 'Skill allowed-tools must be a string'));
  }
  if (data.metadata !== undefined) {
    if (data.metadata === null || Array.isArray(data.metadata) || typeof data.metadata !== 'object') {
      errors.push(error('skill_metadata_invalid', 'Skill metadata must be a string-to-string mapping'));
    } else if (Object.values(data.metadata).some((value) => typeof value !== 'string')) {
      errors.push(error('skill_metadata_invalid', 'Skill metadata values must be strings'));
    }
  }

  errors.sort((left, right) => compareText(left.code, right.code) || compareText(left.message, right.message));
  return {
    body: split.body,
    errors,
    metadata: {
      name: typeof data.name === 'string' ? data.name : null,
      description: typeof data.description === 'string' ? data.description : null,
      license: typeof data.license === 'string' ? data.license : null,
      compatibility: typeof data.compatibility === 'string' ? data.compatibility : null,
      allowedTools: typeof data['allowed-tools'] === 'string' ? data['allowed-tools'] : null,
      metadata: data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
        ? Object.fromEntries(Object.entries(data.metadata).sort(([left], [right]) => compareText(left, right)))
        : null,
    },
  };
}
