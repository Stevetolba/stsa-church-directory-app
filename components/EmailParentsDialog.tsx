"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Mail, Paperclip, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { MAX_ATTACHMENTS_COUNT, MAX_ATTACHMENTS_TOTAL_BYTES } from "@/lib/validation/email";
import type { ChildrenMemberType, ChildWithParents } from "@/lib/subsplash";
import type { Campus, MemberStatus } from "@/types/profile";

const composeSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200, "Too long"),
});
type ComposeValues = z.infer<typeof composeSchema>;

type Step = "compose" | "preview";

interface Attachment {
  filename: string;
  content: string; // base64, no data: prefix
  size: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface EmailParentsFilters {
  search: string;
  status: MemberStatus[];
  campus: Campus[];
  gradeFrom?: number;
  gradeTo?: number;
  ageFrom?: number;
  ageTo?: number;
  memberType: ChildrenMemberType;
}

function buildParams(filters: EmailParentsFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  filters.status.forEach((s) => params.append("status", s));
  filters.campus.forEach((c) => params.append("campus", c));
  if (filters.gradeFrom !== undefined) params.set("gradeFrom", String(filters.gradeFrom));
  if (filters.gradeTo !== undefined) params.set("gradeTo", String(filters.gradeTo));
  if (filters.ageFrom !== undefined) params.set("ageFrom", String(filters.ageFrom));
  if (filters.ageTo !== undefined) params.set("ageTo", String(filters.ageTo));
  params.set("memberType", filters.memberType);
  return params;
}

// ADR-0014: the compose UI for emailing parents of the currently-filtered
// children. Recipients are never picked here — "To" is a read-only list
// computed from the same filters the send itself recomputes server-side, so
// what the review step shows is exactly what gets sent. A review step sits
// between compose and send so a sender can double-check the recipient list,
// subject, and rendered body before anything actually goes out.
export function EmailParentsDialog({
  open,
  onOpenChange,
  user,
  fromAddress,
  filters,
  childCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { name: string; email: string };
  fromAddress: string;
  filters: EmailParentsFilters;
  childCount: number;
}) {
  const [step, setStep] = useState<Step>("compose");
  const [bodyHtml, setBodyHtml] = useState("");
  const [reviewSubject, setReviewSubject] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [recipients, setRecipients] = useState<string[] | null>(null);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ComposeValues>({ resolver: zodResolver(composeSchema), defaultValues: { subject: "" } });

  useEffect(() => {
    if (!open) return;
    setStep("compose");
    setBodyHtml("");
    setAttachments([]);
    reset({ subject: "" });
    setIsLoadingRecipients(true);
    setRecipients(null);

    const params = buildParams(filters);
    params.set("includeParents", "true");
    params.set("pageSize", "5000");
    let cancelled = false;

    fetch(`/api/children?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((result: { profiles: ChildWithParents[] }) => {
        if (cancelled) return;
        const emails = new Set<string>();
        for (const child of result.profiles) {
          if (child.parent1?.email) emails.add(child.parent1.email);
          if (child.parent2?.email) emails.add(child.parent2.email);
        }
        setRecipients(Array.from(emails).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {
        if (!cancelled) setRecipients(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRecipients(false);
      });

    return () => {
      cancelled = true;
    };
    // filters is a plain object rebuilt on every render of the parent page;
    // re-fetching recipients only needs to happen when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (fileList === null || fileInputRef.current === null) return;
    const incoming = Array.from(fileList);
    fileInputRef.current.value = "";

    if (attachments.length + incoming.length > MAX_ATTACHMENTS_COUNT) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS_COUNT} files.`);
      return;
    }
    const currentTotal = attachments.reduce((sum, a) => sum + a.size, 0);
    const incomingTotal = incoming.reduce((sum, f) => sum + f.size, 0);
    if (currentTotal + incomingTotal > MAX_ATTACHMENTS_TOTAL_BYTES) {
      toast.error(`Attachments must total ${formatBytes(MAX_ATTACHMENTS_TOTAL_BYTES)} or less.`);
      return;
    }

    try {
      const read = await Promise.all(
        incoming.map(async (file) => ({
          filename: file.name,
          content: await readFileAsBase64(file),
          size: file.size,
        }))
      );
      setAttachments((prev) => [...prev, ...read]);
    } catch {
      toast.error("Couldn't read one of the selected files.");
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function onContinue(values: ComposeValues) {
    if (!bodyHtml.trim() || bodyHtml === "<p></p>") {
      toast.error("Write a message before continuing.");
      return;
    }
    setReviewSubject(values.subject);
    setStep("preview");
  }

  async function handleSend() {
    setIsSending(true);
    try {
      const res = await fetch("/api/children/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: reviewSubject,
          bodyHtml,
          attachments: attachments.map(({ filename, content }) => ({ filename, content })),
          search: filters.search || undefined,
          status: filters.status,
          campus: filters.campus,
          gradeFrom: filters.gradeFrom,
          gradeTo: filters.gradeTo,
          ageFrom: filters.ageFrom,
          ageTo: filters.ageTo,
          memberType: filters.memberType,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data?.error as string | undefined) ?? "Failed to send email.");
      }
      const data: { recipientCount: number } = await res.json();
      toast.success(`Email sent to ${data.recipientCount} parent${data.recipientCount === 1 ? "" : "s"}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email.");
    } finally {
      setIsSending(false);
    }
  }

  // Recipients see this exact From address — sending "as" an arbitrary
  // signed-in address isn't possible (Resend only sends from a verified
  // domain, and volunteers sign in with personal email providers), so the
  // sender's name is the display name and their email is Reply-To, not the
  // visible From address. Mirrors lib/email.ts's sendBulkEmail exactly.
  const fromField = (
    <div>
      <span className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">From</span>
      <div className="rounded-[10px] border border-[#E5DCC8] bg-brand-cream/40 px-3.5 py-2.5 text-[14px] text-brand-navy">
        {user.name} &lt;{fromAddress}&gt;
      </div>
      <p className="mt-1 text-[12px] text-[#8A94A0]">Replies go to {user.email}.</p>
    </div>
  );

  const totalAttachmentBytes = attachments.reduce((sum, a) => sum + a.size, 0);

  const recipientSummary = isLoadingRecipients
    ? "Calculating recipients…"
    : recipients === null
      ? "Couldn't calculate recipients"
      : recipients.length === 0
        ? "No parent email addresses found for this filter"
        : `${recipients.length} unique parent/guardian email${recipients.length === 1 ? "" : "es"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{step === "compose" ? "Email Parents" : "Review Email"}</DialogTitle>
        <DialogDescription>
          {step === "compose"
            ? `Sends to the parents/guardians of the ${childCount} ${childCount === 1 ? "child" : "children"} matching your current filters.`
            : "Double-check the recipients and message below before sending."}
        </DialogDescription>

        {step === "compose" ? (
          <form onSubmit={handleSubmit(onContinue)} className="mt-5 flex flex-col gap-4">
            {fromField}

            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">To</span>
              <div className="rounded-[10px] border border-[#E5DCC8] bg-brand-cream/40 px-3.5 py-2.5 text-[14px] text-brand-navy">
                {recipientSummary}
              </div>
            </div>

            <div>
              <label htmlFor="subject" className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">
                Subject
              </label>
              <input
                id="subject"
                {...register("subject")}
                className={`w-full rounded-[10px] border ${
                  errors.subject ? "border-destructive" : "border-[#E5DCC8]"
                } bg-white px-3.5 py-2.5 text-[14px] text-brand-navy outline-none focus:border-brand-sky`}
              />
              {errors.subject && <p className="mt-1 text-[12px] text-destructive">{errors.subject.message}</p>}
            </div>

            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">Message</span>
              <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
            </div>

            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">
                Attachments {attachments.length > 0 && `(${formatBytes(totalAttachmentBytes)})`}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <div className="flex flex-col gap-2">
                {attachments.map((attachment, index) => (
                  <div
                    key={`${attachment.filename}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-[#E5DCC8] bg-white px-3.5 py-2 text-[13px] text-brand-navy"
                  >
                    <span className="truncate">
                      {attachment.filename}{" "}
                      <span className="text-[#8A94A0]">({formatBytes(attachment.size)})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="shrink-0 rounded-md p-1 text-[#8A94A0] hover:bg-brand-cream hover:text-brand-navy"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="sr-only">Remove {attachment.filename}</span>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS_COUNT}
                  className="flex w-fit items-center gap-2 rounded-[10px] border border-dashed border-[#E5DCC8] px-3.5 py-2 text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach files
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={isLoadingRecipients || recipients?.length === 0}
                className="rounded-[10px] bg-brand-navy px-5 py-2.5 text-[14px] font-semibold text-brand-cream disabled:opacity-60"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-[10px] border border-[#E5DCC8] px-5 py-2.5 text-[14px] font-semibold text-[#5B7185]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            {fromField}

            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">
                To — {recipientSummary}
              </span>
              <div className="max-h-32 overflow-y-auto rounded-[10px] border border-[#E5DCC8] bg-brand-cream/40 px-3.5 py-2.5 text-[13px] leading-relaxed text-brand-navy">
                {recipients && recipients.length > 0 ? recipients.join(", ") : "—"}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">Subject</span>
              <div className="rounded-[10px] border border-[#E5DCC8] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-brand-navy">
                {reviewSubject}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">Message</span>
              <div
                className="prose-sm max-w-none rounded-[10px] border border-[#E5DCC8] bg-white px-3.5 py-2.5 text-[14px] text-brand-navy"
                // Body is authored by the signed-in sender via RichTextEditor
                // (TipTap StarterKit + Link) — its own paste/command schema
                // constrains output, not arbitrary attacker-controlled HTML.
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            </div>

            {attachments.length > 0 && (
              <div>
                <span className="mb-1.5 block text-[12.5px] font-semibold text-[#5B7185]">
                  Attachments ({formatBytes(totalAttachmentBytes)})
                </span>
                <div className="flex flex-col gap-2">
                  {attachments.map((attachment, index) => (
                    <div
                      key={`${attachment.filename}-${index}`}
                      className="flex items-center gap-2 rounded-[10px] border border-[#E5DCC8] bg-brand-cream/40 px-3.5 py-2 text-[13px] text-brand-navy"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#8A94A0]" />
                      <span className="truncate">
                        {attachment.filename}{" "}
                        <span className="text-[#8A94A0]">({formatBytes(attachment.size)})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !recipients || recipients.length === 0}
                className="flex items-center gap-2 rounded-[10px] bg-brand-navy px-5 py-2.5 text-[14px] font-semibold text-brand-cream disabled:opacity-60"
              >
                <Mail className="h-3.5 w-3.5" />
                {isSending ? "Sending…" : "Send"}
              </button>
              <button
                type="button"
                onClick={() => setStep("compose")}
                disabled={isSending}
                className="flex items-center gap-2 rounded-[10px] border border-[#E5DCC8] px-5 py-2.5 text-[14px] font-semibold text-[#5B7185] disabled:opacity-60"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
