import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  neutral: "bg-muted text-foreground",
  good: "bg-success/10 text-success",
  warn: "bg-warning/10 text-warning",
  bad: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

const statusTone: Record<string, keyof typeof tones> = {
  new: "info",
  contacted: "info",
  qualified: "info",
  site_visit: "warn",
  quote_sent: "warn",
  negotiation: "warn",
  deposit_pending: "warn",
  confirmed: "good",
  completed: "good",
  closed: "neutral",
  ready: "good",
  planning: "info",
  live: "warn",
  lost: "bad",
  cancelled: "bad",
  postponed: "neutral",
  draft: "neutral",
  sent: "info",
  viewed: "info",
  accepted: "good",
  declined: "bad",
  expired: "bad",
  superseded: "neutral",
  tentative: "warn",
  awaiting_deposit: "warn",
  unpaid: "bad",
  partially_paid: "warn",
  paid: "good",
  refunded: "neutral",
  todo: "neutral",
  in_progress: "info",
  scheduled: "info",
  no_show: "bad",
  rescheduled: "warn",
  requested: "info",
  approved: "good",
  rejected: "bad",
  ordered: "warn",
  received: "good",
  quoted: "warn",
  on_track: "good",
  at_risk: "bad",
  interested: "good",
  maybe: "warn",
  not_suitable: "bad",
};

export function StatusPill({ value, label }: { value: string; label?: string }) {
  const tone = statusTone[value] || "neutral";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide", tones[tone])}>
      {label || value.replaceAll("_", " ")}
    </span>
  );
}
