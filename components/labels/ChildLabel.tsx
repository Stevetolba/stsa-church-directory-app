import { ClipboardList, HeartHandshake } from "lucide-react";

// One printable label for a checked-in child (ADR-0015): first name large and
// bold, last name smaller below it, a pickup match code badge, the
// event/session, who dropped them off, and an allergy/care-notes row per
// note that's actually on file — omitted entirely (not left blank) when
// there's nothing to report, so a label without either doesn't waste space
// on two empty rows. Sized and styled to print on Brother DK label stock via
// the browser print dialog (PrintLabelsSheet) — see .print-label /
// .print-label-sheet in globals.css.
export interface ChildLabelData {
  id: string;
  firstName: string;
  lastName: string;
  matchCode: string;
  eventTitle: string;
  sessionName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  allergyNotes?: string | null;
  careNotes?: string | null;
}

export function ChildLabel({ data }: { data: ChildLabelData }) {
  const subtitle = [data.eventTitle, data.sessionName].filter(Boolean).join(" • ");
  const contact = [data.contactName, data.contactPhone].filter(Boolean).join(" • ");

  return (
    <div className="print-label flex w-full max-w-[300px] flex-col gap-1.5 rounded-[14px] border border-[#E5DCC8] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[20px] font-bold leading-tight text-brand-navy">{data.firstName}</div>
          <div className="truncate text-[13px] text-[#8A94A0]">{data.lastName}</div>
        </div>
        <span className="shrink-0 rounded-lg bg-brand-navy px-2.5 py-1 text-[15px] font-bold text-brand-cream">
          {data.matchCode}
        </span>
      </div>
      <hr className="border-[#EAE2D0]" />
      {subtitle && <div className="text-[12px] font-semibold text-brand-navy">{subtitle}</div>}
      {contact && <div className="text-[11px] text-[#5B7185]">Dropped off by: {contact}</div>}
      {data.allergyNotes && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#5B7185]">
          <ClipboardList className="h-3 w-3 shrink-0" />
          Allergies: {data.allergyNotes}
        </div>
      )}
      {data.careNotes && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#5B7185]">
          <HeartHandshake className="h-3 w-3 shrink-0" />
          Care notes: {data.careNotes}
        </div>
      )}
    </div>
  );
}
