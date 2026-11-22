import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { WebSocketServer } from 'ws';
import { CLAUSES, CONTRACTS, NDA_ID } from '../fixtures/review-browser.mjs';

const [phase = 'after', build = 'apps/web/dist', out = 'docs/redesign/cobalt/screenshots'] = process.argv.slice(2);
assert.ok(['before', 'after', 'verify'].includes(phase), 'Usage: npm run shots -- before|after|verify BUILD_DIR OUTPUT_DIR');
const baseline = phase === 'before';
const dist = path.resolve(build);
const outDir = path.resolve(out);
const apiPort = 9462;
const contractPath = `/contract/${NDA_ID}`;
const answer = 'Section 5 carries the highest risk. The confidentiality exception leaves liability uncapped.';
const clock = new Date('2026-11-22T10:00:00Z');
const user = { id: 'user-a', email: 'reviewer@example.test', user_metadata: { full_name: 'Alex Morgan' } };
const session = {
  access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', token_type: 'bearer',
  expires_at: 2_145_916_800, expires_in: 3600, user,
};
const decisions = new Map();
let rejectNextDecision = false;
const files = new Map(Object.entries({
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
}));

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

const api = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.headers.authorization !== 'Bearer synthetic-access') { sendJson(res, 401, {}); return; }
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/contracts') {
    const counts = { total: CLAUSES.length, decided: decisions.size };
    sendJson(res, 200, CONTRACTS.map((contract) => contract.id === NDA_ID
      ? { ...contract, reviewProgress: counts }
      : contract));
  } else if (req.method === 'GET' && url.pathname === `/contracts/${NDA_ID}/clauses`) {
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    sendJson(res, 200, CLAUSES.slice(offset, offset + limit).map((clause) => ({
      ...clause, review: decisions.get(clause.id),
    })));
  } else if (req.method === 'PUT' && url.pathname.startsWith(`/contracts/${NDA_ID}/review/`)) {
    if (rejectNextDecision) {
      rejectNextDecision = false;
      req.resume();
      sendJson(res, 503, { error: 'Synthetic write failure' });
      return;
    }
    const clause = url.pathname.split('/').at(-1);
    if (!CLAUSES.some(({ id }) => id === clause)) { sendJson(res, 404, {}); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const decision = JSON.parse(body);
      const review = decision.outcome ? { ...decision, updatedAt: clock.toISOString() } : null;
      if (review) decisions.set(clause, review);
      else decisions.delete(clause);
      sendJson(res, 200, { review });
    });
  }
  else if (req.method === 'POST' && req.url === '/contracts/upload') {
    req.resume();
    req.once('end', () => sendJson(res, 201, CONTRACTS[0]));
  } else if (req.method === 'DELETE' && req.url.startsWith('/contracts/')) sendJson(res, 200, { success: true });
  else sendJson(res, 404, {});
});
const sockets = new WebSocketServer({ server: api, path: '/ws' });
sockets.on('connection', (socket) => {
  socket.on('message', (message) => {
    const payload = JSON.parse(message);
    if (payload.accessToken !== 'synthetic-access') { socket.close(1008); return; }
    if (payload.type === 'subscribe') {
      socket.send(JSON.stringify({ type: 'subscribed', contractId: payload.contractId }));
      if (uploading && payload.contractId === NDA_ID) {
        uploading = false;
        socket.send(JSON.stringify({ type: 'progress', data: { contractId: payload.contractId, stage: 'extracting', percent: 30, message: 'Extracting text…' } }));
        setTimeout(() => {
          if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'progress', data: { contractId: payload.contractId, stage: 'completed', percent: 100, message: 'Ready to review' } }));
        }, 600);
      }
    }
    if (payload.type === 'chat') {
      for (const word of answer.split(' ')) socket.send(JSON.stringify({ type: 'token', token: `${word} ` }));
      socket.send(JSON.stringify({ type: 'chat_end' }));
    }
  });
});
let uploading = false;

const site = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const absolute = path.resolve(dist, `.${pathname}`);
    if (!absolute.startsWith(dist + path.sep) && absolute !== dist) { res.writeHead(403).end(); return; }
    const match = await stat(absolute).catch(() => null);
    const file = match?.isFile() ? absolute : path.join(dist, 'index.html');
    res.writeHead(200, { 'content-type': files.get(path.extname(file)) ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

const base = `http://127.0.0.1:${await listen(site, 0)}`;
let browser;
const errors = [];
const auditFailures = [];
let auditedStates = 0;

async function open({ authed = false, width = 1440, theme = 'light' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 960 },
    colorScheme: theme, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC',
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(clock);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ authed, theme, session }) => {
    localStorage.setItem('auditmind-theme', theme);
    if (authed) localStorage.setItem('sb-dummy-auth-token', JSON.stringify(session));
  }, { authed, theme, session });
  await context.route('https://dummy.supabase.co/**', (route) => {
    const url = new URL(route.request().url());
    const json = url.pathname.endsWith('/profiles') ? { full_name: 'Alex Morgan' }
      : url.pathname.endsWith('/verify') ? session : {};
    return route.fulfill({ json });
  });
  await context.routeWebSocket('wss://dummy.supabase.co/**', () => {});
  return page;
}

async function route(page, pathname) {
  await page.goto(base + pathname);
}

async function check(page, name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, `Horizontal overflow at ${name}`);
  const result = await new AxeBuilder({ page }).analyze();
  auditedStates += 1;
  for (const finding of result.violations) {
    const details = finding.nodes.map((node) => `${node.target.join(' ')}\n${node.failureSummary ?? ''}`);
    auditFailures.push(`${name}: ${finding.id}\n${details.join('\n')}`);
  }
}

async function shot(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  if (phase !== 'verify') await page.screenshot({ path: path.join(outDir, `${phase}-${name}.png`), fullPage: true, animations: 'disabled' });
  if (!baseline) await check(page, name);
  console.log(`${phase} ${name}`);
}

async function publicScreens(options = {}) {
  const page = await open(options);
  const suffix = options.width ? `-${options.width === 390 ? 'mobile' : options.width}` : options.theme === 'dark' ? '-dark' : '';
  await route(page, '/');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot(page, `landing${suffix}`);
  if (phase === 'after' && !options.width && !options.theme) {
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.screenshot({ path: path.join(outDir, 'after-social-preview.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  if (!baseline) {
    await page.getByRole('button', { name: /Governing law/ }).click();
    await page.getByRole('heading', { name: 'Governing law', exact: true }).waitFor();
  }
  if (options.width && phase !== 'verify') { await page.context().close(); return; }
  await route(page, '/login');
  await page.locator('input[type=email]').waitFor();
  await shot(page, `login${suffix}`);
  if (!baseline) {
    await page.getByRole('button', { name: 'Send sign-in code' }).click();
    await page.getByRole('alert').filter({ hasText: 'Enter a valid email address' }).waitFor();
    await page.getByLabel('Email address').fill('reviewer@example.test');
    await page.getByRole('button', { name: 'Send sign-in code' }).click();
    await page.getByLabel('Verification code').waitFor();
    await page.getByLabel('Verification code').fill('123456');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await page.getByRole('heading', { name: 'Contracts', exact: true }).waitFor();
  }
  await route(page, '/missing-page');
  await page.getByRole('heading', { name: 'Page not found', exact: false }).waitFor();
  await shot(page, `not-found${suffix}`);
  if (!baseline) {
    for (const label of ['Privacy', 'Terms of use']) {
      await page.getByRole('link', { name: label }).click();
      await page.getByRole('heading', { name: label, level: 1 }).waitFor();
      await check(page, label);
    }
  }
  await page.context().close();
}

async function workspaceScreens(options = {}) {
  const page = await open({ authed: true, ...options });
  const suffix = options.width ? `-${options.width === 390 ? 'mobile' : options.width}` : options.theme === 'dark' ? '-dark' : '';
  await route(page, '/dashboard');
  await page.getByText('Mutual NDA — Acme Corp', { exact: true }).waitFor();
  await shot(page, `dashboard${suffix}`);

  if (!baseline && !options.width) {
    await page.getByRole('button', { name: 'To review', exact: true }).click();
    await page.getByRole('link', { name: /mutual nda/i }).waitFor();
    await page.getByText('Employment Agreement — Delta').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'All contracts', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search contracts by name' }).fill('Gamma');
    await page.getByRole('link', { name: /vendor agreement/i }).waitFor();
    await page.getByRole('link', { name: /mutual nda/i }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByLabel('Filter by risk level').selectOption('high');
    await page.getByRole('link', { name: /mutual nda/i }).waitFor();
    await page.getByRole('link', { name: /vendor agreement/i }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByLabel('Sort contracts').selectOption('risk-desc');
    await page.getByRole('button', { name: /Delete Lease/ }).click();
    await page.getByRole('group', { name: /Confirm deletion/ }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: /Delete Lease/ }).click();
    await page.getByRole('group', { name: /Confirm deletion/ }).getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: /Delete Lease/ }).waitFor({ state: 'detached' });
  }

  await route(page, contractPath);
  const section = page.getByRole('button', { name: /Select clause.*Limitation of Liability/i });
  await section.click();
  await page.getByText('unlimited liability', { exact: true }).last().waitFor();
  await shot(page, `analysis${suffix}`);

  if (!baseline) {
    await section.focus();
    await page.keyboard.press('ArrowUp');
    await page.getByRole('button', { name: /Select clause.*Governing Law/i }).and(page.locator('[aria-pressed="true"]')).waitFor();
    await page.keyboard.press('/');
    assert.equal(await page.getByRole('searchbox', { name: 'Search clauses' }).evaluate((el) => el === document.activeElement), true);
    await page.getByRole('searchbox', { name: 'Search clauses' }).fill('confidentiality');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('input[aria-label="Search clauses"]')?.value === '');
    await section.click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export report' }).click();
    assert.ok((await download).suggestedFilename().endsWith('.md'));
  }
  if (!baseline && !options.width && !options.theme) await verifyDecisions(page, section);
  if (options.width && phase !== 'verify') { await page.context().close(); return; }

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('button', { name: /Add.*Indemnification/i }).click();
  await page.getByRole('button', { name: /Add.*Limitation of Liability/i }).click();
  await page.getByText('Compare clauses', { exact: true }).waitFor();
  await shot(page, `comparison${suffix}`);

  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByText('Connected', { exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole('textbox', { name: 'Ask a question about this contract' }).fill('Which clause has the highest risk?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByText(answer, { exact: true }).waitFor();
  await shot(page, `chat${suffix}`);

  await route(page, '/upload');
  await page.getByRole('heading', { name: 'Upload a contract' }).waitFor();
  await shot(page, `upload${suffix}`);
  if (!baseline) {
    const input = page.locator('input[type=file]');
    await input.setInputFiles({ name: 'wrong.exe', mimeType: 'text/plain', buffer: Buffer.from('test') });
    await page.getByRole('alert').waitFor();
    uploading = true;
    await input.setInputFiles({ name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from('A synthetic test agreement.') });
    await page.getByRole('progressbar').waitFor();
    await page.getByRole('heading', { level: 1, name: /Mutual NDA/ }).waitFor();
  }
  await page.context().close();
}

async function verifyDecisions(page, section) {
  const finding = page.getByRole('heading', { name: 'Limitation of Liability', exact: true });
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  await page.getByRole('heading', { name: 'Read the document' }).waitFor();
  await shot(page, 'document');
  await page.getByRole('link', { name: 'Jump to selected clause' }).click();
  await page.getByRole('button', { name: /Open finding for Section 5/ }).click();
  await finding.waitFor();

  const decision = page.getByLabel('Decision', { exact: true });
  const note = page.getByLabel('Reviewer note');
  const save = page.getByRole('button', { name: 'Save decision' });
  await decision.selectOption('revise');
  await save.click();
  assert.equal(await note.evaluate((node) => node.validity.valueMissing), true);
  await note.fill('Ask for a fixed liability cap.');
  rejectNextDecision = true;
  await save.click();
  await page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
  assert.equal(await note.inputValue(), 'Ask for a fixed liability cap.');
  await save.click();
  await page.getByText('Decision saved.', { exact: true }).waitFor();
  await page.getByText('1 of 6 decided', { exact: true }).waitFor();
  await shot(page, 'decision');
  await page.reload();
  await finding.waitFor();
  assert.equal(await decision.inputValue(), 'revise');
  assert.equal(await note.inputValue(), 'Ask for a fixed liability cap.');

  const findingLocation = new URL(page.url()).pathname + new URL(page.url()).search;
  await route(page, '/dashboard');
  await page.getByText('1 of 6 decided', { exact: true }).waitFor();
  await route(page, findingLocation);
  await finding.waitFor();

  const report = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report' }).click();
  const markdown = await readFile(await (await report).path(), 'utf8');
  assert.match(markdown, /Review decision: Request revision/);
  assert.match(markdown, /Ask for a fixed liability cap/);

  await page.getByRole('button', { name: 'Next undecided' }).click();
  await page.getByRole('heading', { name: 'Notices', exact: true }).waitFor();
  await page.getByLabel('Undecided only').check();
  await section.waitFor({ state: 'hidden' });
  await page.getByLabel('Undecided only').uncheck();
  await section.click();
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  await page.getByText('Clause reopened.', { exact: true }).waitFor();
  await page.getByText('0 of 6 decided', { exact: true }).waitFor();
  await page.reload();
  await finding.waitFor();
  assert.equal(await page.getByLabel('Decision', { exact: true }).inputValue(), '');
}

async function darkScreens() {
  const page = await open({ authed: true, theme: 'dark' });
  await route(page, contractPath);
  await page.getByRole('button', { name: /Select clause.*Limitation of Liability/i }).click();
  await shot(page, 'analysis-dark');
  if (baseline) { await page.context().close(); return; }
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('auditmind-theme')), 'light');
  await page.context().close();
}

try {
  await listen(api, apiPort);
  await mkdir(outDir, { recursive: true });
  const executablePath = process.env.CHROME_BIN || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath });
  await publicScreens();
  await workspaceScreens();
  await publicScreens({ width: 390 });
  await workspaceScreens({ width: 390 });
  await darkScreens();
  if (phase === 'verify') {
    await publicScreens({ theme: 'dark' });
    await workspaceScreens({ theme: 'dark' });
    for (const width of [320, 768]) {
      await publicScreens({ width });
      await workspaceScreens({ width });
    }
  }
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  assert.deepEqual(auditFailures, [], 'Automated accessibility findings');
  if (auditedStates > 0) console.log(`${auditedStates} page states passed axe and viewport checks.`);
} finally {
  await browser?.close();
  for (const socket of sockets.clients) socket.terminate();
  sockets.close();
  api.closeAllConnections();
  api.close();
  site.closeAllConnections();
  site.close();
}
