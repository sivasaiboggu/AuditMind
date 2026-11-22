// Real Chrome renders for review: desktop 1280px + phone 390px.
// Run: node scripts/shots.mjs demo   (default build, no Supabase env)
//      node scripts/shots.mjs live   (dummy-Supabase build + stub API)
// Writes docs/screenshots-1.0.7/*.png. Modelled on the kirana-commerce
// recipe for this VM: Hatch Chrome needs a WebGL domain-policy file just
// to start, and it blocks navigation to http://localhost (Local Network
// Access checks), so pages load over file:// with
// --allow-file-access-from-files, launched with the first URL as a CLI
// argument.
//
// file:// breaks BrowserRouter (the pathname is the file path, so every
// route renders the 404 page). The fix is Page.addScriptToEvaluateOnNew
// Document: a history.replaceState to the target route runs before the
// app mounts, so the router sees the right path. In-app moves after
// load use pushState + popstate as usual.
//
// Two builds, because the demo login only exists when no auth provider
// is configured, while populated screens need a session:
//   demo: npm run build:web
//   live: VITE_SUPABASE_URL=https://dummy.supabase.co VITE_SUPABASE_ANON_KEY=dummy-anon-key \
//         VITE_API_URL=http://localhost:3000 VITE_WS_URL=ws://localhost:3000/ws npm run build:web
// The script checks dist for the dummy URL and refuses the wrong mode.
// Live mode also starts a stub API on :3000 serving fixed fixture
// contracts/clauses (clearly labelled test data below, never product
// data) and seeds a local Supabase session, so the populated dashboard
// and contract view render with real rows. --disable-web-security is a
// test-harness flag only: file:// pages cannot fetch localhost
// otherwise. It is never a product change. dist/ is gitignored.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const MODE = process.argv[2] === 'live' ? 'live' : 'demo';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'apps/web/dist');
const OUT = path.join(ROOT, 'docs/screenshots-1.0.7');
const CHROME = process.env.CHROME_BIN || '/opt/meta-chromium/chrome';
// A random debug port per run: a fixed port collides with other agents'
// Chrome instances on this shared VM, and this script would then drive
// their page instead of ours (silent wrong renders).
const DEBUG_PORT = 9300 + Math.floor(Math.random() * 200);
const STUB_PORT = 3000;

// --- Stub API fixtures: fixed test data for renders only. ---
const CONTRACTS = [
  { id: 'a1b2c3d4-0001-4000-8000-000000000001', userId: 'user-a', name: 'Mutual NDA — Acme Corp', filePath: 'contracts/a1-nda.pdf', status: 'completed', overallRiskScore: 68, createdAt: '2026-11-18T10:00:00.000Z', updatedAt: '2026-11-18T10:04:00.000Z', processingAttempts: 0, processingError: null, nextRetryAt: null },
  { id: 'a1b2c3d4-0002-4000-8000-000000000002', userId: 'user-a', name: 'Master Services Agreement — Beta Ltd', filePath: 'contracts/a2-msa.pdf', status: 'completed', overallRiskScore: 32, createdAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:05:00.000Z', processingAttempts: 0, processingError: null, nextRetryAt: null },
  { id: 'a1b2c3d4-0003-4000-8000-000000000003', userId: 'user-a', name: 'Vendor Agreement — Gamma Inc', filePath: 'contracts/a3-vendor.pdf', status: 'completed', overallRiskScore: 84, createdAt: '2026-11-03T10:00:00.000Z', updatedAt: '2026-11-03T10:06:00.000Z', processingAttempts: 0, processingError: null, nextRetryAt: null },
  { id: 'a1b2c3d4-0004-4000-8000-000000000004', userId: 'user-a', name: 'Employment Agreement — Delta', filePath: 'contracts/a4-employment.pdf', status: 'processing', overallRiskScore: 0, createdAt: '2026-11-21T09:00:00.000Z', updatedAt: '2026-11-21T09:00:00.000Z', processingAttempts: 1, processingError: null, nextRetryAt: null },
  { id: 'a1b2c3d4-0005-4000-8000-000000000005', userId: 'user-a', name: 'Lease — Epsilon Properties', filePath: 'contracts/a5-lease.pdf', status: 'failed', overallRiskScore: 0, createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:02:00.000Z', processingAttempts: 3, processingError: 'ANALYSIS_INCOMPLETE', nextRetryAt: null },
];
const NDA_ID = CONTRACTS[0].id;
const CLAUSES = [
  { id: 'c1', contractId: NDA_ID, number: 'Section 1', title: 'Confidentiality', text: 'The receiving party shall keep all confidential information private and shall not disclose it to any third party without prior written consent.', riskLevel: 'medium', riskScore: 45, matchedTerms: ['confidential'], riskExplanation: 'The duty is one-sided and has no time limit, so information stays confidential indefinitely even after the agreement ends.', suggestedRedline: 'Confidentiality obligations apply for three years after disclosure, and do not cover information that becomes public through no fault of the receiving party.' },
  { id: 'c2', contractId: NDA_ID, number: 'Section 2', title: 'Indemnification', text: 'Each party shall indemnify and hold harmless the other party against all losses arising from its negligence or breach of this agreement, including reasonable legal fees.', riskLevel: 'high', riskScore: 64, matchedTerms: ['indemnify', 'negligence'], riskExplanation: 'The indemnity is uncapped and covers legal fees with no carve-out for the indemnified party\u2019s own negligence.', suggestedRedline: 'Each party indemnifies the other for losses caused by its own negligence or breach, capped at the fees paid under this agreement in the prior twelve months.' },
  { id: 'c3', contractId: NDA_ID, number: 'Section 3', title: 'Term and Termination', text: 'This agreement renews automatically for successive one-year terms unless either party gives 90 days\u2019 written notice before the renewal date.', riskLevel: 'medium', riskScore: 47, matchedTerms: ['automatically', 'renews'], riskExplanation: 'Automatic renewal with a 90-day notice window is easy to miss, which locks the parties into another year.', suggestedRedline: 'This agreement renews for successive one-year terms unless either party gives 30 days\u2019 written notice; the renewing party must send a reminder 45 days before each renewal date.' },
  { id: 'c4', contractId: NDA_ID, number: 'Section 4', title: 'Governing Law', text: 'This agreement is governed by the laws of the State of Delaware, and the parties submit to the exclusive jurisdiction of its courts.', riskLevel: 'high', riskScore: 61, matchedTerms: ['exclusive jurisdiction'], riskExplanation: 'Exclusive Delaware jurisdiction means any dispute must be litigated there, regardless of where the parties operate.', suggestedRedline: 'The parties submit to the non-exclusive jurisdiction of the courts of Delaware and of the receiving party\u2019s home state.' },
  { id: 'c5', contractId: NDA_ID, number: 'Section 5', title: 'Limitation of Liability', text: 'Neither party\u2019s total liability shall exceed the fees paid under this agreement, except for breaches of confidentiality, which carry unlimited liability.', riskLevel: 'critical', riskScore: 82, matchedTerms: ['unlimited liability', 'confidentiality'], riskExplanation: 'The confidentiality carve-out removes the cap exactly where the exposure is largest, leaving unlimited liability for the riskiest breach.', suggestedRedline: 'Total liability is capped at twice the fees paid in the prior twelve months, including for breaches of confidentiality.' },
  { id: 'c6', contractId: NDA_ID, number: 'Section 6', title: 'Notices', text: 'Notices under this agreement must be sent by email to the addresses listed in Schedule A and are deemed received on sending.', riskLevel: 'low', riskScore: 18, riskExplanation: 'Email notice with deemed receipt on sending is standard practice for agreements of this kind.', suggestedRedline: undefined },
];

function startStub() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, `http://localhost:${STUB_PORT}`);
    if (req.method === 'GET' && url.pathname === '/contracts') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(CONTRACTS));
      return;
    }
    const clauseMatch = /^\/contracts\/([^/]+)\/clauses$/.exec(url.pathname);
    if (req.method === 'GET' && clauseMatch) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(clauseMatch[1] === NDA_ID ? CLAUSES : []));
      return;
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/contracts/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found.' }));
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let payload;
      try { payload = JSON.parse(String(raw)); } catch { return; }
      if (payload.type === 'subscribe') {
        ws.send(JSON.stringify({ type: 'subscribed', contractId: payload.contractId }));
      } else if (payload.type === 'chat') {
        const answer = 'Section 5 carries the highest risk in this agreement: the confidentiality carve-out removes the liability cap exactly where the exposure is largest.';
        for (const word of answer.split(' ')) ws.send(JSON.stringify({ type: 'token', token: `${word} ` }));
        ws.send(JSON.stringify({ type: 'chat_end' }));
      }
    });
  });
  return new Promise((resolve) => server.listen(STUB_PORT, () => resolve({ server, wss })));
}

function chromeArgs(debugPort, firstUrl) {
  const policy = 'hatch-webgl-allowed-domains-v1\nexample.com\n';
  const file = path.join(os.tmpdir(), 'auditmind-webgl-policy.txt');
  fs.writeFileSync(file, policy);
  const sha = createHash('sha256').update(policy).digest('hex');
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    // Test-harness flag only: file:// pages cannot fetch the stub API
    // otherwise. Never a product change.
    '--disable-web-security',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'auditmind-chrome-'))}`,
    `--hatch-webgl-allowed-domains-file=${file}`,
    `--hatch-webgl-allowed-domains-sha256=${sha}`,
    `--remote-debugging-port=${debugPort}`,
    '--window-size=1280,900',
    firstUrl,
  ];
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }

  // Every CDP call has a timeout: a hung target used to hang this script
  // forever with no error naming the stuck call.
  async call(method, params = {}, timeoutMs = 30000) {
    await this.ready;
    const id = this.nextId++;
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP call timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
    this.ws.send(JSON.stringify({ id, method, params }));
    return done;
  }

  async eval(expression) {
    const { result } = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.text}`);
    return result.value;
  }

  async waitForEvent(method, timeoutMs = 30000) {
    const start = Date.now();
    for (;;) {
      const i = this.events.findIndex((e) => e.method === method);
      if (i >= 0) return this.events.splice(i, 1)[0];
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${method}`);
      await delay(100);
    }
  }

  /** Poll page text until it contains `needle` — readiness, not a guess.
   * Case-insensitive: innerText applies CSS text-transform, so an
   * uppercase-styled heading reads "CONTRACT COMPLIANCE SUITE" even
   * though the source says "Contract Compliance Suite". */
  async waitForText(needle, timeoutMs = 60000) {
    const start = Date.now();
    for (;;) {
      const found = await this.eval(`document.body.innerText.toLowerCase().includes(${JSON.stringify(needle.toLowerCase())})`).catch(() => false);
      if (found) return;
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for page text ${JSON.stringify(needle)}`);
      await delay(500);
    }
  }

  /** Poll until a selector matches — for elements whose text lives in a
   * placeholder or aria-label, which innerText never shows. */
  async waitForSelector(selector, timeoutMs = 60000) {
    const start = Date.now();
    for (;;) {
      const found = await this.eval(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false);
      if (found) return;
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for selector ${JSON.stringify(selector)}`);
      await delay(500);
    }
  }

  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

const pageUrl = () => `file://${DIST}/index.html`;

/** Load the app from disk, then move in-app to `route`.
 * NOTE: do NOT history.replaceState before load — it rewrites the
 * document URL to file:/// and relative ./assets/... URLs then 404
 * (ERR_FILE_NOT_FOUND), so React never mounts. The bundle loads at the
 * file path first (the router shows the 404 page for a moment), then
 * pushState + popstate moves to the route once the app is up.
 * Readiness is a per-load marker set by the injected script: a stale
 * Page.loadEventFired from the initial CLI-arg load can land after
 * navigate is issued, and go() run against the old document gets wiped
 * by the navigation commit. The marker only exists on the new
 * document, so it cannot be faked by a stale event. */
async function load(cdp, route, theme) {
  const marker = `shots-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const setup = [
    `window.__shotsLoad = ${JSON.stringify(marker)};`,
    theme ? `localStorage.setItem('auditmind-theme', ${JSON.stringify(theme)});` : '',
  ].join('\n');
  await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: setup });
  await cdp.call('Page.navigate', { url: pageUrl() });
  const start = Date.now();
  for (;;) {
    const hit = await cdp.eval(`window.__shotsLoad === ${JSON.stringify(marker)}`).catch(() => false);
    if (hit) break;
    if (Date.now() - start > 30000) throw new Error('timed out waiting for the new document after navigate');
    await delay(200);
  }
  await go(cdp, route);
}

/** SPA navigation without a reload: pushState + popstate is what
 * react-router listens to. */
async function go(cdp, route) {
  await cdp.eval(`history.pushState({}, '', ${JSON.stringify(route)}); window.dispatchEvent(new PopStateEvent('popstate'));`);
}

async function shot(cdp, name, width, waitMs = 1200) {
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width, height: 900, deviceScaleFactor: 1, mobile: width < 600,
  });
  await delay(waitMs);
  const { data } = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  console.log('wrote', name);
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error(`No build at ${DIST}. Build first — see the header of this file for the ${MODE} command.`);
  }
  // The two modes need different builds; refuse the wrong one loudly
  // instead of rendering the wrong state (e.g. a hidden demo button).
  const builtJs = fs.readdirSync(path.join(DIST, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8'))
    .join('\n');
  const hasDummySupabase = builtJs.includes('dummy.supabase.co');
  if (MODE === 'live' && !hasDummySupabase) {
    throw new Error('live mode needs the dummy-Supabase build (see header). Rebuild with the dummy env first.');
  }
  if (MODE === 'demo' && hasDummySupabase) {
    throw new Error('demo mode needs the default build (no Supabase env). Rebuild without env vars first.');
  }
  fs.mkdirSync(OUT, { recursive: true });
  let stub = null;
  if (MODE === 'live') stub = await startStub();
  const chrome = spawn(CHROME, chromeArgs(DEBUG_PORT, pageUrl()));
  try {
    let wsUrl = null;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        const targets = await res.json();
        // Only drive our own page: another Chrome on this port would
        // hand us a foreign target and every shot would be wrong.
        const page = targets.find((t) => t.type === 'page' && t.url.startsWith(`file://${DIST}`));
        if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
      } catch { /* not up yet */ }
      await delay(200);
    }
    if (!wsUrl) throw new Error(`No AuditMind page target on DevTools port ${DEBUG_PORT} — another Chrome may own this port`);
    const cdp = new Cdp(wsUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    // The Google Fonts stylesheet hangs on this VM's egress proxy, and a
    // pending stylesheet blocks module-script execution, so the app
    // sometimes never mounts. Block the font hosts in the harness only:
    // renders fall back to system fonts (layout still verifies), and the
    // product keeps its real font link for real networks.
    await cdp.call('Network.enable');
    await cdp.call('Network.setBlockedURLs', { urls: ['*://fonts.googleapis.com/*', '*://fonts.gstatic.com/*'] });

    if (MODE === 'demo') {
      await load(cdp, '/', 'light');
      await cdp.waitForText('Contract risk analysis');
      await shot(cdp, '01-landing-light.png', 1280);
      await shot(cdp, '02-landing-mobile.png', 390);
      await load(cdp, '/', 'dark');
      await cdp.waitForText('Contract risk analysis');
      await shot(cdp, '03-landing-dark.png', 1280);
      await go(cdp, '/login');
      await cdp.waitForText('Contract Compliance Suite');
      await shot(cdp, '04-login.png', 1280);
      // Demo account: the dashboard in demo mode has no backend, so the
      // list fetch fails and the honest empty state renders.
      await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Continue with a demo account'))?.click();`);
      await cdp.waitForText('No contracts yet');
      await shot(cdp, '05-dashboard-demo-empty.png', 1280);
      await go(cdp, '/no-such-page');
      await cdp.waitForText('Page Not Found');
      await shot(cdp, '06-not-found.png', 1280);
    } else {
      // Seeded session: the app now fetches the stub API. The profile
      // lookup against the dummy host fails, so auth takes a few seconds
      // to settle — waitForText covers it instead of a fixed sleep.
      const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 365;
      const session = {
        access_token: 'user-a', token_type: 'bearer', expires_in: 86400 * 365,
        expires_at: expiresAt, refresh_token: 'stub-refresh',
        user: { id: 'user-a', email: 'demo.analyst@auditmind.local', user_metadata: { full_name: 'Demo Analyst' } },
      };
      await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
        source: `localStorage.setItem('sb-dummy-auth-token', ${JSON.stringify(JSON.stringify(session))});`,
      });
      await load(cdp, '/dashboard', 'dark');
      await cdp.waitForText('Mutual NDA');
      // Recharts sizes itself on a ResizeObserver cycle after the data
      // lands; shooting before the ticks exist catches blank panels.
      await cdp.waitForSelector('.recharts-cartesian-axis-tick');
      await shot(cdp, '07-dashboard.png', 1280, 2000);
      await go(cdp, `/contract/${NDA_ID}`);
      await cdp.waitForText('Confidentiality');
      await shot(cdp, '08-contract-view.png', 1280, 2000);
      await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('AI Chat'))?.click();`);
      await cdp.waitForSelector('input[aria-label="Ask a question about this contract"]');
      await cdp.eval(`{ const input = document.querySelector('input[aria-label="Ask a question about this contract"]'); if (input) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'Which clause is riskiest?'); input.dispatchEvent(new Event('input', { bubbles: true })); } }`);
      await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Send message')?.click();`);
      await cdp.waitForText('Section 5 carries the highest risk');
      await shot(cdp, '09-contract-chat.png', 1280, 1500);
      await go(cdp, '/upload');
      await cdp.waitForText('Upload contract');
      await shot(cdp, '10-upload.png', 1280);
    }

    cdp.close();
  } finally {
    chrome.kill('SIGTERM');
    if (stub) {
      // server.close() waits for open connections; terminate the stub
      // sockets first or this script never exits.
      stub.wss.clients.forEach((client) => client.terminate());
      stub.server.closeAllConnections?.();
      stub.server.close();
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
