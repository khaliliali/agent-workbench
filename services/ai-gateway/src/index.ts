export default {
  async fetch(request: Request): Promise<Response> {
    return new Response('AI Gateway is running');
  },
};
