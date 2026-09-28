/**
 * Local OpenAI-compatible mock for demoing chat without a real API key.
 *
 *   npm run mock:ai
 *   Admin → POST /admin/providers
 *     { "name": "Mock AI", "type": "OPENAI", "apiKey": "mock-key-1234",
 *       "defaultModel": "mock-echo", "baseUrl": "http://localhost:4010/v1" }
 *
 * Replies echo the prompt and report how much conversation context was received.
 * Supports `stream: true` (Server-Sent Events, one chunk per word) like the real API.
 */
const http = require('node:http');

const PORT = Number(process.env.MOCK_AI_PORT) || 4010;

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return send(res, 401, { error: { message: 'Missing API key' } });
  }

  if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
    return send(res, 200, { object: 'list', data: [{ id: 'mock-echo', object: 'model' }] });
  }

  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: { message: 'Invalid JSON' } });
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const last = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
      const earlier = messages.filter((m) => m.role !== 'system').length - 1;
      const content =
        `[mock ${body.model}] You said: "${last}". ` +
        `I received ${earlier} earlier message(s) as context.`;
      const words = (text) => text.split(/\s+/).filter(Boolean).length;
      const usage = {
        prompt_tokens: messages.reduce((n, m) => n + words(String(m.content ?? '')), 0),
        completion_tokens: words(content),
      };

      if (body.stream) {
        // OpenAI-style Server-Sent Events: one chunk per word, then usage, then [DONE].
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        const chunk = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
        const pieces = content.split(/(?<= )/);
        let i = 0;
        const timer = setInterval(() => {
          if (i < pieces.length) {
            chunk({ object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: pieces[i++] } }] });
            return;
          }
          clearInterval(timer);
          if (body.stream_options?.include_usage) chunk({ object: 'chat.completion.chunk', choices: [], usage });
          res.write('data: [DONE]\n\n');
          res.end();
        }, 40);
        res.on('close', () => clearInterval(timer)); // client disconnected (or finished)
        return;
      }

      send(res, 200, {
        id: `chatcmpl-mock-${Date.now()}`,
        object: 'chat.completion',
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage,
      });
    });
    return;
  }

  send(res, 404, { error: { message: `No mock route for ${req.method} ${req.url}` } });
});

server.listen(PORT, () => {
  console.log(`Mock AI (OpenAI-compatible) listening on http://localhost:${PORT}/v1`);
});
