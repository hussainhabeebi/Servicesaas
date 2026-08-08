import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png", "logo.png"],
      manifest: {
        name: "ServBazaar",
        short_name: "ServBazaar",
        description: "Run your service business — bookings, leads, invoicing and WhatsApp, in one app.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f7f6ec",
        theme_color: "#036f71",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
          { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App data is per-tenant and changes constantly — never cache API
        // responses, only the app shell so it launches instantly offline.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 4174 },
});
