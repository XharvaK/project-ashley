import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parsePlugin } from '../src/parser.mjs';

const fixturesRoot = fileURLToPath(new URL('../fixtures/', import.meta.url));

test('identical fixture bytes and filesystem state yield byte-identical normalized descriptors', async () => {
  const entries = await fs.readdir(fixturesRoot, { withFileTypes: true });
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const root = path.join(fixturesRoot, entry.name);
    const first = JSON.stringify(await parsePlugin(root));
    const second = JSON.stringify(await parsePlugin(root));
    assert.equal(second, first, entry.name);
    assert.equal(first.includes(path.resolve(root)), false, `${entry.name} leaked a machine-specific package root`);
  }
});
