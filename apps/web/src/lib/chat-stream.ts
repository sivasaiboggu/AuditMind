import type { ChatMessage } from '@auditmind/shared-types';

export const INCOMPLETE_ANSWER = '[Incomplete answer]';
export function interruptChat(messages: ChatMessage[], assistantId: string): ChatMessage[] {
  return messages.map(message => message.id === assistantId ? {
    ...message,
    message: `${INCOMPLETE_ANSWER} This response did not finish. Do not rely on it; retry your question.`,
  } : message);
}
export function chatHistory(messages: ChatMessage[]) {
  return messages.filter(message => message.message && !message.message.startsWith(INCOMPLETE_ANSWER))
    .map(message => ({ role: message.sender === 'user' ? 'user' as const : 'model' as const, content: message.message }));
}
