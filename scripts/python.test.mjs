import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pythonExecutable, main } from './python.mjs';

test('POSIX selects the virtual environment bin directory', () => {
  assert.equal(pythonExecutable('linux', '/project/ml'), path.join('/project/ml', '.venv', 'bin', 'python'));
});
test('Windows selects the virtual environment Scripts directory', () => {
  assert.equal(pythonExecutable('win32', '/project/ml'), path.join('/project/ml', '.venv', 'Scripts', 'python.exe'));
});
test('invalid actions fail before spawning commands', () => {
  assert.throws(() => main('invalid'), /Usage:/);
});
