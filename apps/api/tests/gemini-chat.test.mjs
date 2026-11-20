import { test } from 'node:test';
import assert from 'node:assert/strict';
// Offline: the builder is pure and needs no provider key.
delete process.env.GEMINI_API_KEY;
const { buildChatContents } = await import('../dist/services/gemini.js');

test('consecutive same-role messages merge so the request stays alternating', () => {
  const contents = buildChatContents([
    { role: 'user', content: 'What is clause 1?' },
    { role: 'user', content: 'And clause 2?' },
    { role: 'model', content: 'Clause 1 says X.' },
    { role: 'model', content: 'Clause 2 says Y.' },
    { role: 'user', content: 'Thanks.' },
  ], 'System prompt.');
  assert.deepEqual(contents.map(c => c.role), ['user', 'user', 'model', 'user']);
  assert.equal(contents[0].parts[0].text, 'System prompt.');
  assert.equal(contents[1].parts[0].text, 'What is clause 1?\nAnd clause 2?');
  assert.equal(contents[2].parts[0].text, 'Clause 1 says X.\nClause 2 says Y.');
  assert.equal(contents[3].parts[0].text, 'Thanks.');
});

test('a leading model message still alternates after the system prompt', () => {
  const contents = buildChatContents([{ role: 'model', content: 'Hello.' }], 'System prompt.');
  assert.deepEqual(contents.map(c => c.role), ['user', 'model']);
});

test('blank messages are dropped and the input is not mutated', () => {
  const messages = [
    { role: 'user', content: '  ' },
    { role: 'user', content: 'Real question.' },
    { role: 'user', content: 'Follow-up.' },
  ];
  const contents = buildChatContents(messages, 'System prompt.');
  assert.equal(contents.length, 2);
  assert.equal(contents[1].parts[0].text, 'Real question.\nFollow-up.');
  assert.equal(messages[1].content, 'Real question.');
});
