// Cloudflare Pages Function: GET /api/token
import { handleTokenRequest, type TokenEnv } from '../../server/token';

export const onRequest = (context: { request: Request; env: TokenEnv }): Promise<Response> =>
  handleTokenRequest(context.request, context.env);
