import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// User-facing text lives in the web and API sources, the README, the page
// meta and the package descriptions. Test files are excluded: they quote
// the banned words to assert their absence, and they are not shipped.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCAN_DIRS = [path.join(ROOT, 'apps/web/src'), path.join(ROOT, 'apps/api/src')];
const SCAN_FILES = [
  path.join(ROOT, 'README.md'),
  path.join(ROOT, 'apps/web/index.html'),
  path.join(ROOT, 'apps/web/tailwind.config.js'),
  path.join(ROOT, 'package.json'),
  path.join(ROOT, 'apps/web/package.json'),
  path.join(ROOT, 'apps/api/package.json'),
];

// Emoji and decorative symbols: pictographs, dingbats, geometric shapes
// (includes the ▸ glyph) and arrows. Plain punctuation the UI legitimately
// uses — em dashes, ellipses, middots — is outside these ranges.
const DECORATIVE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{2190}-\u{21FF}]/u;

// Marketing words that read as AI-generated hype, not as a description of
// what the product does. Keep the list in one place: adding a word here
// is the whole change when a new cliché shows up.
const BANNED_WORDS = [
  'seamless',
  'supercharge',
  'elevate',
  'unlock',
  'revolution',
  'game-changer',
  'AI-powered',
  'cutting-edge',
  'next-gen',
  'world-class',
  'superpower',
  'enterprise-grade',
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (/\.(ts|tsx|css|html)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Slop patterns from the design playbook (docs/design-references-1.0.6.md):
// frosted surfaces, staggered entrances and shimmering placeholders are
// hard fails, not style preferences. Plain substrings, case-insensitive —
// a comment reintroducing one fails the same as code using it.
const BANNED_PATTERNS = ['backdrop-blur', 'stagger', 'shimmer'];

function violationsFor(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const found: string[] = [];
  const decorative = text.match(DECORATIVE);
  if (decorative) found.push(`decorative symbol ${JSON.stringify(decorative[0])}`);
  for (const word of BANNED_WORDS) {
    if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      found.push(`banned word ${JSON.stringify(word)}`);
    }
  }
  for (const pattern of BANNED_PATTERNS) {
    if (text.toLowerCase().includes(pattern)) {
      found.push(`banned slop pattern ${JSON.stringify(pattern)}`);
    }
  }
  return found;
}

describe('copy guard', () => {
  it('user-facing text has no emoji, decorative symbols, marketing clichés or slop patterns', () => {
    const files = [...SCAN_DIRS.flatMap(collectFiles), ...SCAN_FILES];
    assert.ok(files.length > 10, `expected to scan real source files, found ${files.length}`);
    const bad: string[] = [];
    for (const file of files) {
      for (const violation of violationsFor(file)) {
        bad.push(`${path.relative(ROOT, file)}: ${violation}`);
      }
    }
    assert.deepEqual(bad, [], `copy-guard violations:\n${bad.join('\n')}`);
  });
});
