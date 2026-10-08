export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function html(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...headers,
    },
  });
}

export async function readJson<T = any>(request: Request): Promise<T> {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Content-Type 必須為 application/json');
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, 'JSON 格式錯誤');
  }
}

export function methodNotAllowed(): Response {
  return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET,POST,PATCH,PUT,DELETE,OPTIONS' });
}

export function noContent(headers: HeadersInit = {}): Response {
  return new Response(null, { status: 204, headers });
}

export function securityHeaders(response: Response): Response {
  const h = new Headers(response.headers);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  if ((h.get('content-type') || '').includes('text/html')) {
    h.set('Content-Security-Policy', [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

export function cleanPath(path: string): string {
  const p = path.replace(/\/{2,}/g, '/');
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}
