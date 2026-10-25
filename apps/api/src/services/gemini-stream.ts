import { StringDecoder } from 'node:string_decoder';

/** Decode complete SSE JSON events, not regex matches over network chunks. */
export async function readGeminiSse(
  stream: AsyncIterable<Buffer>, onToken: (token: string) => void,
): Promise<void> {
  const decoder = new StringDecoder('utf8');
  let buffer = '', pendingBytes = 0, emitted = false;
  const consume = (event: string) => {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const payload = JSON.parse(data);
    if (payload.error) throw new Error('Provider stream error.');
    for (const part of payload.candidates?.[0]?.content?.parts || []) {
      if (typeof part.text === 'string' && part.text) {
        emitted = true; onToken(part.text);
      }
    }
  };
  for await (const chunk of stream) {
    pendingBytes += chunk.length;
    if (pendingBytes > 1024 * 1024) throw new Error('Provider stream event exceeds limit.');
    buffer += decoder.write(chunk);
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      consume(buffer.slice(0, boundary.index));
      buffer = buffer.slice(boundary.index + boundary[0].length);
      pendingBytes = Buffer.byteLength(buffer);
    }
  }
  buffer += decoder.end();
  // A final unterminated event still must be complete JSON, not silently lost.
  if (buffer.trim()) consume(buffer);
  if (!emitted) throw new Error('Provider stream contained no answer text.');
}
