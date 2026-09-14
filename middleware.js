import { next, rewrite } from '@vercel/functions';

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.hostname !== 'inlandguide.hapagidt.com') return next();
  url.pathname = '/retired.html';
  return rewrite(url, { headers: { 'Cache-Control': 'no-store' } });
}

export const config = {
  matcher: ['/', '/index.html'],
};
