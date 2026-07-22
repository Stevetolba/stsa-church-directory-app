"use client";

// Per-device kiosk print preferences (ADR-0015), persisted in localStorage so
// they stick across kiosk sessions on the same iPad — a lightweight stand-in
// for Subsplash's per-device "Kiosk Type" settings (idle background,
// calendar filter, print toggles) until Phase 3 (device auth) adds a real
// per-device config model. Only the two print toggles are implemented now;
// everything else in that settings screen is device-profile scoped and
// doesn't apply to today's signed-in, single-event kiosk.

export interface KioskPrintSettings {
  printChildLabels: boolean;
  printParentLabels: boolean;
}

const KEYS: Record<keyof KioskPrintSettings, string> = {
  printChildLabels: "kiosk:printChildLabels",
  printParentLabels: "kiosk:printParentLabels",
};

const DEFAULTS: KioskPrintSettings = {
  printChildLabels: true,
  printParentLabels: true,
};

export function loadKioskPrintSettings(): KioskPrintSettings {
  if (typeof window === "undefined") return DEFAULTS;
  const read = (key: string, fallback: boolean) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  };
  return {
    printChildLabels: read(KEYS.printChildLabels, DEFAULTS.printChildLabels),
    printParentLabels: read(KEYS.printParentLabels, DEFAULTS.printParentLabels),
  };
}

export function saveKioskPrintSetting(key: keyof KioskPrintSettings, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYS[key], String(value));
}
