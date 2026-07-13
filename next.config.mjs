import withPWAInit from "@ducanh2912/next-pwa";

const isDev = process.env.NODE_ENV === "development";

const withPWA = withPWAInit({
  dest: "public",
  // Disable in dev to avoid the service worker interfering with HMR.
  disable: isDev,
  register: true,
  reloadOnOnline: true,
  // We supply our own runtime caching (below) so we never fall back to the
  // package default, which caches /api GET responses — unacceptable here since
  // those responses carry member PII behind RBAC.
  cacheOnFrontEndNav: false,
  // Serve a friendly offline page when a navigation fails and nothing usable
  // is cached. Precached automatically from the build output.
  fallbacks: { document: "/offline" },
  workboxOptions: {
    runtimeCaching: [
      // Never cache authenticated API responses (PII + RBAC). Always hit network.
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
      // Never persist authenticated page HTML to disk either — some detail
      // pages are server-rendered with PII. Offline is covered by the
      // document fallback above.
      {
        urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
        handler: "NetworkOnly",
      },
      // Content-hashed build assets are safe and immutable.
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/_next\/image\?.*/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "next-image",
          expiration: { maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      // App icons and the logo (non-sensitive static assets).
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-images",
          expiration: { maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPWA(nextConfig);
