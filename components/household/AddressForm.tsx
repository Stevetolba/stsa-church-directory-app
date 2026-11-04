"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAddressAction, discardChangesAction } from "@/app/(household)/household-update/actions";
import { errorCls, inputCls, labelCls, primaryBtn, secondaryBtn } from "./ui";

export function AddressForm(props: {
  initial: { street: string; city: string; state: string; postal_code: string };
  hasPendingChanges: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(props.initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const r = await saveAddressAction(v);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    router.push("/household-update");
    router.refresh();
  }

  async function onDiscard() {
    setBusy(true);
    await discardChangesAction({ type: "household", id: "" });
    router.push("/household-update");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {errors.form && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{errors.form}</p>}
      <div>
        <label className={labelCls} htmlFor="street">Street</label>
        <input id="street" className={inputCls} value={v.street} onChange={set("street")} autoComplete="street-address" />
        {errors.street && <p className={errorCls}>{errors.street}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className={labelCls} htmlFor="city">City</label>
          <input id="city" className={inputCls} value={v.city} onChange={set("city")} autoComplete="address-level2" />
          {errors.city && <p className={errorCls}>{errors.city}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="state">State</label>
          <input id="state" className={inputCls} value={v.state} onChange={set("state")} autoComplete="address-level1" />
          {errors.state && <p className={errorCls}>{errors.state}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="postal_code">ZIP code</label>
          <input id="postal_code" className={inputCls} value={v.postal_code} onChange={set("postal_code")} autoComplete="postal-code" />
          {errors.postal_code && <p className={errorCls}>{errors.postal_code}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <button type="submit" className={primaryBtn} disabled={busy}>Save</button>
        <button type="button" className={secondaryBtn} disabled={busy} onClick={() => router.push("/household-update")}>Cancel</button>
        {props.hasPendingChanges && (
          <button type="button" className="text-sm text-muted-foreground underline sm:ml-auto" disabled={busy} onClick={onDiscard}>
            Undo my address changes
          </button>
        )}
      </div>
    </form>
  );
}
