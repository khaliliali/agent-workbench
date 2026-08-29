let cachedToken: { value: string; expiresAt: number } | null = null;

async function getGatewayToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const res = await fetch(`${process.env.GATEWAY_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: process.env.GATEWAY_CLIENT_ID,
      clientSecret: process.env.GATEWAY_CLIENT_SECRET,
    }),
  });

  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 10_000,
  };

  return data.access_token;
}

export async function callGateway(body: unknown): Promise<Response> {
  const token = await getGatewayToken();
  return fetch(process.env.GATEWAY_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}
