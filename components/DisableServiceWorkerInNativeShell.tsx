"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// ADR-0019 (Capacitor Phase 3): the PWA service worker (next.config.mjs,
// @ducanh2912/next-pwa) exists to make the *web* app installable and
// offline-tolerant — neither of which the native shell needs, since it's
// already a native install and its WebView only ever loads server.url
// (capacitor.config.ts). Worse, a service worker intercepting navigation
// and asset requests inside a WebView that Capacitor's own bridge is also
// driving is an unnecessary source of caching bugs. The next-pwa plugin has
// no per-platform registration gate (it injects its own registration script
// at build time), so this unregisters any active registration after the
// fact instead, rather than patching the plugin's internals.
export function DisableServiceWorkerInNativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  }, []);

  return null;
}
