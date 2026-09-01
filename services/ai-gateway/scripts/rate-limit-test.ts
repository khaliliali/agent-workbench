const GATEWAY_URL =
  process.env.GATEWAY_URL ||
  'https://agent-workbench-gateway.alikhalili.workers.dev';
const CLIENT_ID = process.env.GATEWAY_CLIENT_ID!;
const CLIENT_SECRET = process.env.GATEWAY_CLIENT_SECRET!;

async function getToken(): Promise<string> {
  const res = await fetch(`${GATEWAY_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
  });
  const data = await res.json();
  return data.access_token;
}

async function sendRequest(token: string, index: number) {
  const start = Date.now();
  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', parts: [{ type: 'text', text: 'Say hi in one word' }] },
      ],
    }),
  });
  const elapsed = Date.now() - start;
  return { index, status: res.status, elapsed, ok: res.ok };
}

async function main() {
  const token = await getToken();
  console.log('Firing 8 concurrent requests...\n');

  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => sendRequest(token, i)),
  );

  for (const r of results.sort((a, b) => a.index - b.index)) {
    console.log(
      `Request ${r.index}: status ${r.status}, ${r.elapsed}ms, ${r.ok ? 'OK' : 'REJECTED'}`,
    );
  }

  const succeeded = results.filter((r) => r.ok).length;
  const rejected = results.filter((r) => !r.ok).length;
  console.log(
    `\n${succeeded} succeeded, ${rejected} rejected out of ${results.length}`,
  );
}

main().catch(console.error);
