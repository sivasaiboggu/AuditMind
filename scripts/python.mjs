import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function pythonExecutable(platform, root) {
  return platform === 'win32'
    ? path.join(root, '.venv', 'Scripts', 'python.exe')
    : path.join(root, '.venv', 'bin', 'python');
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status ?? 'unknown'})`);
}

export function main(action) {
  if (!['setup', 'dev'].includes(action)) throw new Error('Usage: node scripts/python.mjs setup|dev');
  const root = fileURLToPath(new URL('../apps/ml-service/', import.meta.url));
  const python = pythonExecutable(process.platform, root);
  if (action === 'setup') {
    if (!existsSync(python)) {
      if (process.env.PYTHON) {
        run(process.env.PYTHON, ['-m', 'venv', '.venv'], root);
      } else if (process.platform === 'win32') {
        run('py', ['-3', '-m', 'venv', '.venv'], root);
      } else {
        run('python3', ['-m', 'venv', '.venv'], root);
      }
    }
    run(python, ['-m', 'pip', 'install', '-r', 'requirements.txt'], root);
  } else {
    if (!existsSync(python)) throw new Error('ML virtual environment missing. Run npm run setup:ml first.');
    run(python, ['-m', 'uvicorn', 'main:app', '--reload', '--port', '8000'], root);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
