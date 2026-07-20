"use client";

// Per-device kiosk print preferences (ADR-0015), persisted in localStorage so
// they stick across kiosk sessions on the same iPad — a lightweight stand-in
// for Subsplash's per-device "Kiosk Type" settings (idle background,
// calendar filter, print toggles) until Phase 3 (device auth) adds a real
// per-device config model. Only the parent-label toggle is implemented now;
// everything else in that settings screen is device-profile scoped and
// doesn't apply to today's signed-in, single-event kiosk.

export interface KioskPrintSettings {
  printParentLabels: boolean;
}

const KEYS: Record<keyof KioskPrintSettings, string> = {
  printParentLabels: "kiosk:printParentLabels",
};

const DEFAULTS: KioskPrintSettings = {
  printParentLabels: true,
};

export function loadKioskPrintSettings(): KioskPrintSettings {
  if (typeof window === "undefined") return DEFAULTS;
  const read = (key: string, fallback: boolean) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  };
  return {
    printParentLabels: read(KEYS.printParentLabels, DEFAULTS.printParentLabels),
  };
}

export function saveKioskPrintSetting(key: keyof KioskPrintSettings, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYS[key], String(value));
}
