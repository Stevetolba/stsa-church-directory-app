// Native silent printing (Capacitor phase 1) — talks to a Brother QL-820NWB
// directly over its own SDK connection via @rdlabo/capacitor-brotherprint,
// bypassing the OS print dialog entirely. This is the thing a *web* app
// fundamentally cannot do: physical testing across this project's earlier
// PRs confirmed iOS Safari has no reliable path to a label printer (AirPrint
// ignores @page sizing; window.print()/hidden-iframe/share-sheet PDF routes
// all hit real platform ceilings). A native shell talking to the printer's
// own SDK sidesteps that whole class of problem.
//
// Safe to import from any client component regardless of whether the app is
// actually running inside the native shell — @capacitor/core and this
// plugin both ship a web fallback (WebPlugin) that no-ops/rejects rather
// than crashing, so a plain browser tab loading this file is fine as long
// as nothing here is *called* without first checking isNativePrintAvailable().
"use client";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  BrotherPrint,
  BrotherPrintEventsEnum,
  BRLMPrinterImageRotation,
  BRLMPrinterLabelName,
  BRLMPrinterModelName,
  BRLMPrinterPort,
  type BRLMChannelResult,
} from "@rdlabo/capacitor-brotherprint";
import type { LabelStockId } from "./labelStock";

// Only the printer this app's kiosks actually use — confirmed (both in
// Brother's own model enum and in this project's physical testing) to work
// over Wi-Fi on iOS; Bluetooth is not supported for this model on iOS.
const MODEL_NAME = BRLMPrinterModelName.QL_820NWB;

const SAVED_PRINTER_KEY = "brother-printer-channel";

export function isNativePrintAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BrotherPrint");
}

// printImage's encodedImage is base64 with no "data:...;base64," prefix (the
// plugin's own docs: "base64 removed mime-type") — html-to-image's toBlob
// gives us raw PNG bytes, not a data URL, so this is a plain byte→base64
// encode, not a prefix-strip. Chunked to avoid blowing the call stack on
// String.fromCharCode(...bytes) for a large image (pixelRatio: 3 captures
// can be a few hundred KB).
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(binary);
}

// --- Paired-printer persistence (Capacitor Preferences, not localStorage —
// the native shell's storage, survives the app being backgrounded/killed) ---

export async function getSavedPrinter(): Promise<BRLMChannelResult | null> {
  const { value } = await Preferences.get({ key: SAVED_PRINTER_KEY });
  if (!value) return null;
  try {
    return JSON.parse(value) as BRLMChannelResult;
  } catch {
    return null;
  }
}

export async function savePrinter(printer: BRLMChannelResult): Promise<void> {
  await Preferences.set({ key: SAVED_PRINTER_KEY, value: JSON.stringify(printer) });
}

export async function clearSavedPrinter(): Promise<void> {
  await Preferences.remove({ key: SAVED_PRINTER_KEY });
}

// Re-checks a previously saved printer is still reachable (e.g. on the same
// Wi-Fi) — call before printing so a stale/out-of-range printer surfaces as
// "pair again" rather than a confusing mid-print failure.
export async function isSavedPrinterAvailable(printer: BRLMChannelResult): Promise<boolean> {
  try {
    const { result } = await BrotherPrint.isChannelAvailable(printer);
    return result;
  } catch {
    return false;
  }
}

// --- Discovery ---
//
// search() itself resolves to void — results stream in via the
// onPrinterAvailable event, not a returned array, so callers need to listen
// before searching. Returns a cleanup function that removes the listener and
// cancels an in-flight search (safe to call even after it already finished).
export async function discoverPrinters(
  onFound: (printer: BRLMChannelResult) => void,
  { searchDurationSeconds = 15 }: { searchDurationSeconds?: number } = {}
): Promise<() => void> {
  const handle = await BrotherPrint.addListener(BrotherPrintEventsEnum.onPrinterAvailable, onFound);
  await BrotherPrint.search({ port: BRLMPrinterPort.wifi, searchDuration: searchDurationSeconds });
  return () => {
    handle.remove();
    BrotherPrint.cancelSearchWiFiPrinter().catch(() => {
      // Already finished/timed out — nothing to cancel.
    });
  };
}

// --- Label stock → Brother SDK settings ---
//
// Brother's label enum names the *physical* die-cut shape (width-then-height
// as manufactured), which is independent of how this app orients its own
// print content. lib/labelStock.ts's dk-1234 preset is deliberately stored
// landscape (86mm wide × 60mm tall — physical testing showed the badge reads
// better held horizontally), but the physical DK-1234 stock is itself a
// portrait 60×86 die-cut (DieCutW60H86 is the only matching Brother enum
// value) — so that preset needs a 90° image rotation to land our landscape
// content correctly on the portrait-cut label. The continuous-roll presets
// need no rotation at all: their "width" already matches the roll's fixed
// dimension in both models.
interface NativeLabelSettings {
  labelName: BRLMPrinterLabelName;
  imageRotation: BRLMPrinterImageRotation;
}

const NATIVE_LABEL_SETTINGS: Record<LabelStockId, NativeLabelSettings> = {
  "dk-2205": { labelName: BRLMPrinterLabelName.RollW62, imageRotation: BRLMPrinterImageRotation.Rotate0 },
  "dk-1234": { labelName: BRLMPrinterLabelName.DieCutW60H86, imageRotation: BRLMPrinterImageRotation.Rotate90 },
  // No exact 62×46.5mm die-cut in Brother's enum (this preset has no
  // confirmed DK part number yet, same caveat lib/labelStock.ts already
  // flags) — approximated as the 62mm continuous roll until a real part
  // number is confirmed against physical stock.
  "custom-62x46": { labelName: BRLMPrinterLabelName.RollW62, imageRotation: BRLMPrinterImageRotation.Rotate0 },
};

// --- Printing ---
//
// printImage()'s own promise resolves once the print request is *issued*,
// not once it's actually printed — the real outcome arrives asynchronously
// via onPrint (success) / onPrintFailedCommunication / onPrintError. Race
// those against a timeout so callers get one definitive resolve/reject.
const PRINT_RESULT_TIMEOUT_MS = 20_000;

export async function printLabelImage(base64Png: string, stockId: LabelStockId): Promise<void> {
  const printer = await getSavedPrinter();
  if (!printer) {
    throw new Error("No printer paired yet — set one up in Label settings.");
  }
  const { labelName, imageRotation } = NATIVE_LABEL_SETTINGS[stockId];

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let handles: { remove: () => void }[] = [];
    const cleanup = () => {
      handles.forEach((h) => h.remove());
      handles = [];
    };

    const timer = setTimeout(() => settle(() => reject(new Error("Timed out waiting for the printer to respond."))), PRINT_RESULT_TIMEOUT_MS);
    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      fn();
    }

    // Register the outcome listeners before issuing the print — printImage's
    // own promise only confirms the request was *sent*, not that it printed;
    // the real result (success/failure) arrives on these events.
    Promise.all([
      BrotherPrint.addListener(BrotherPrintEventsEnum.onPrint, () => settle(resolve)),
      BrotherPrint.addListener(BrotherPrintEventsEnum.onPrintFailedCommunication, (info) =>
        settle(() => reject(new Error(info.message || "Could not communicate with the printer.")))
      ),
      BrotherPrint.addListener(BrotherPrintEventsEnum.onPrintError, (info) =>
        settle(() => reject(new Error(info.message || "The printer reported an error.")))
      ),
    ])
      .then((registered) => {
        if (settled) {
          registered.forEach((h) => h.remove());
          return;
        }
        handles = registered;
        return BrotherPrint.printImage({
          // Spread first: BRLMChannelResult's own `modelName` is a plain
          // string (whatever the discovered printer reported), not the
          // BRLMPrinterModelName enum printImage requires — the explicit
          // property below must come after so it wins, not the other way
          // around, since duplicate keys in a later position take priority
          // in both the emitted value and TS's inferred type.
          ...printer,
          encodedImage: base64Png,
          modelName: MODEL_NAME,
          labelName,
          imageRotation,
        }).catch((err) => settle(() => reject(err instanceof Error ? err : new Error(String(err)))));
      })
      .catch((err) => settle(() => reject(err instanceof Error ? err : new Error(String(err)))));
  });
}
