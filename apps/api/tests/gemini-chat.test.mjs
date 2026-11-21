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
  // The system prompt is a user turn, so it folds into the opening user
  // message: two user turns in a row is a 400 from the provider.
  assert.deepEqual(contents.map(c => c.role), ['user', 'model', 'user']);
  assert.equal(contents[0].parts[0].text, 'System prompt.\n\nWhat is clause 1?\nAnd clause 2?');
  assert.equal(contents[1].parts[0].text, 'Clause 1 says X.\nClause 2 says Y.');
  assert.equal(contents[2].parts[0].text, 'Thanks.');
  for (let i = 1; i < contents.length; i++) {
    assert.notEqual(contents[i].role, contents[i - 1].role);
  }
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
  assert.equal(contents.length, 1);
  assert.equal(contents[0].parts[0].text, 'System prompt.\n\nReal question.\nFollow-up.');
  assert.equal(messages[1].content, 'Real question.');
});
