import { rewrite, next } from '@vercel/edge';

export const config = {
  matcher: '/((?!api/|assets/|icons/|sw\\.|workbox-|manifest|registerSW|favicon|site/|cupboard/).*)',
};

export default function middleware(req: Request) {
  const url = new URL(req.url);
  const host = (req.headers.get('host') || '').toLowerCase();

  if (host === 'stmarklegacy.org' || host === 'www.stmarklegacy.org') {
    const target = new URL(url);
    target.pathname = url.pathname === '/' ? '/site/index.html' : `/site${url.pathname}`;
    return rewrite(target);
  }

  if (host === 'cupboard.cc' || host === 'www.cupboard.cc') {
    const target = new URL(url);
    target.pathname = url.pathname === '/' ? '/cupboard/index.html' : `/cupboard${url.pathname}`;
    return rewrite(target);
  }

  return next();
}
