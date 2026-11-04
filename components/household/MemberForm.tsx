"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMemberAction, saveNewMemberAction, discardChangesAction } from "@/app/(household)/household-update/actions";
import { GRADE_LEVELS } from "@/lib/grades";
import { errorCls, inputCls, labelCls, primaryBtn, secondaryBtn } from "./ui";

export interface MemberFormProps {
  // An existing person (profile id) or a proposed new member (key may be null for a brand-new one).
  mode: "existing" | "new";
  profileId?: string;
  newKey?: string | null;
  isChild: boolean;
  initial: { first_name: string; last_name: string; date_of_birth: string; gradeValue: number | null; role?: string };
  hasPendingChanges?: boolean;
}

export function MemberForm(props: MemberFormProps) {
  const router = useRouter();
  const [first, setFirst] = useState(props.initial.first_name);
  const [last, setLast] = useState(props.initial.last_name);
  const [dob, setDob] = useState(props.initial.date_of_birth);
  const [grade, setGrade] = useState<string>(props.initial.gradeValue ? String(props.initial.gradeValue) : "");
  const [role, setRole] = useState<string>(props.initial.role ?? "child");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isNew = props.mode === "new";
  const isChild = isNew ? role === "child" : props.isChild;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const base = {
      first_name: first,
      last_name: last,
      date_of_birth: dob,
      grade_value: isChild && grade ? Number(grade) : null,
    };
    const result = isNew
      ? await saveNewMemberAction(props.newKey ?? null, { ...base, role: role as "parent" | "guardian" | "child" })
      : await saveMemberAction(props.profileId as string, base);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    router.push("/household-update");
    router.refresh();
  }

  async function onDiscard() {
    if (!props.profileId) return;
    setBusy(true);
    await discardChangesAction({ type: "profile", id: props.profileId });
    router.push("/household-update");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {errors.form && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{errors.form}</p>}

      {isNew && (
        <div>
          <label className={labelCls} htmlFor="role">This person is a</label>
          <select id="role" className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="child">Child</option>
            <option value="parent">Parent</option>
            <option value="guardian">Guardian</option>
          </select>
          {errors.role && <p className={errorCls}>{errors.role}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="first_name">First name</label>
          <input id="first_name" className={inputCls} value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" />
          {errors.first_name && <p className={errorCls}>{errors.first_name}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="last_name">Last name</label>
          <input id="last_name" className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" />
          {errors.last_name && <p className={errorCls}>{errors.last_name}</p>}
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="dob">Date of birth</label>
        <input id="dob" type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} />
        {errors.date_of_birth && <p className={errorCls}>{errors.date_of_birth}</p>}
      </div>

      {isChild && (
        <div>
          <label className={labelCls} htmlFor="grade">Grade</label>
          <select id="grade" className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Not sure / leave as is</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Grades move up automatically each school year, so only change this if the grade we show is wrong.
          </p>
          {errors.grade_value && <p className={errorCls}>{errors.grade_value}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <button type="submit" className={primaryBtn} disabled={busy}>Save</button>
        <button type="button" className={secondaryBtn} disabled={busy} onClick={() => router.push("/household-update")}>Cancel</button>
        {props.hasPendingChanges && (
          <button type="button" className="text-sm text-muted-foreground underline sm:ml-auto" disabled={busy} onClick={onDiscard}>
            Undo my changes for this person
          </button>
        )}
      </div>
    </form>
  );
}
