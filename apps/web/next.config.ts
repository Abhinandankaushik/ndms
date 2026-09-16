import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const apiOrigin = (process.env.API_ORIGIN ?? 'http://localhost:3000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Proxying REST through the web origin keeps the httpOnly refresh cookie first-party.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

// Serwist builds the service worker from a webpack plugin, and Next 16 runs Turbopack unless asked
// otherwise — where the plugin never runs and a `webpack` key is a hard error. Build the PWA with
// `next build --webpack`; without that flag the app is served exactly as before, minus the worker.
export default process.env.TURBOPACK ? nextConfig : withServiceWorker(nextConfig);

function withServiceWorker(config: NextConfig): NextConfig {
  return withSerwistInit({
    swSrc: 'app/sw.ts',
    swDest: 'public/sw.js',
    // Serwist reloads the page when connectivity returns, which would throw away a half-written
    // report or an SOS in flight. The outbox is what recovers from a reconnection here.
    reloadOnOnline: false,
    disable: process.env.NODE_ENV === 'development',
  })(config);
}
