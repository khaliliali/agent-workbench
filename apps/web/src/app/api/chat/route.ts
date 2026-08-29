import { callGateway } from '@/lib/gateway-client';

export async function POST(req: Request) {
  const body = await req.json();
  const gatewayResponse = await callGateway(body);

  return new Response(gatewayResponse.body, {
    status: gatewayResponse.status,
    headers: gatewayResponse.headers,
  });
}
