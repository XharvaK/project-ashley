import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parsePlugin } from '../src/parser.mjs';

const fixturesRoot = fileURLToPath(new URL('../fixtures/', import.meta.url));

test('parsing the complete static fixture corpus performs no process or network operation', async (t) => {
  const calls = [];
  const blocked = (name) => (...args) => {
    calls.push({ name, args });
    throw new Error(`forbidden side effect: ${name}`);
  };
  const patches = [
    [childProcess, 'spawn'],
    [childProcess, 'spawnSync'],
    [childProcess, 'exec'],
    [childProcess, 'execFile'],
    [childProcess, 'fork'],
    [net, 'connect'],
    [net, 'createConnection'],
    [http, 'request'],
    [http, 'get'],
    [https, 'request'],
    [https, 'get'],
  ];
  for (const [owner, key] of patches) {
    const original = owner[key];
    owner[key] = blocked(`${owner === childProcess ? 'child_process' : owner === net ? 'net' : owner === http ? 'http' : 'https'}.${key}`);
    t.after(() => { owner[key] = original; });
  }

  const entries = await fs.readdir(fixturesRoot, { withFileTypes: true });
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    await parsePlugin(path.join(fixturesRoot, entry.name));
  }

  assert.deepEqual(calls, []);
});
