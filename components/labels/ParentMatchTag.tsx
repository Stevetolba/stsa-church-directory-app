// The matching stub for the adult who dropped a child off (ADR-0015): the
// same code printed on the child's ChildLabel, big enough to check at a
// glance during pickup. One tag per match code, not per child — siblings
// checked in together share a code (and therefore the same drop-off adult),
// so a parent carries a single tag.
export interface ParentMatchTagData {
  matchCode: string;
  childNames: string[];
  dropOffName?: string | null;
}

export function ParentMatchTag({ data }: { data: ParentMatchTagData }) {
  return (
    <div className="print-label flex w-[300px] flex-col items-center gap-1 rounded-[14px] border border-[#E5DCC8] bg-white p-4 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">Pickup code</div>
      <div className="text-[36px] font-bold leading-tight text-brand-navy">{data.matchCode}</div>
      <div className="text-[12px] text-[#5B7185]">{data.childNames.join(", ")}</div>
      {data.dropOffName && <div className="text-[11px] text-[#5B7185]">Dropped off by: {data.dropOffName}</div>}
    </div>
  );
}
