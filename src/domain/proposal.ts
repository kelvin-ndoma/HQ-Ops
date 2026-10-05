import { formatKsh } from "./money";

/** Client proposals are built by copying these fields only. Internal notes never enter this shape. */
export type ClientProposal = {
  reference: string;
  version: number;
  organization: string;
  contactName: string;
  eventTitle: string;
  eventDateLabel: string;
  guestsLabel: string;
  date: string;
  time: string;
  venue: string;
  guestCount: string;
  eventType: string;
  lines: { description: string; quantity: number; unit: string; rateLabel: string; totalLabel: string }[];
  subtotalLabel: string;
  discountLabel: string;
  taxLabel: string;
  totalLabel: string;
  depositLabel: string;
  balanceLabel: string;
  showDeposit: boolean;
  inclusions: string[];
  arrangements: string;
  requirements: string;
  terms: { title: string; content: string }[];
  validUntil: string | null;
  hqName: string;
  hqPhone: string;
  hqEmail: string;
  hqAddress: string;
};

const BANNED_KEYS = ["internalnote", "margin", "vendorcost", "grosscontribution", "approval", "unitcost", "costcents", "threshold"];

export function findInternalLeak(value: unknown, path = ""): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findInternalLeak(value[index], `${path}[${index}].`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (BANNED_KEYS.some((word) => key.toLowerCase().includes(word))) return `${path}${key}`;
    const found = findInternalLeak(child, `${path}${key}.`);
    if (found) return found;
  }
  return null;
}

export function toClientProposal(input: {
  reference: string;
  version: number;
  organization: string;
  contactName: string;
  eventTitle: string;
  eventDateLabel: string;
  guestsLabel: string;
  date: string;
  time: string;
  venue: string;
  guestCount: string;
  eventType: string;
  lines: { description: string; quantity: number; unit?: string; unitPriceCents: number; totalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  inclusions?: string[];
  arrangements?: string;
  clientRequirements?: string;
  terms: { title: string; content: string }[];
  validUntil: string | null;
  hq: { name: string; phone: string; email: string; address: string; city: string };
}): ClientProposal {
  const depositCents = Math.max(0, input.depositCents || 0);
  const balanceCents = Math.max(0, input.totalCents - depositCents);
  return {
    reference: input.reference,
    version: input.version,
    organization: input.organization,
    contactName: input.contactName,
    eventTitle: input.eventTitle,
    eventDateLabel: input.eventDateLabel,
    guestsLabel: input.guestsLabel,
    date: input.date,
    time: input.time,
    venue: input.venue,
    guestCount: input.guestCount,
    eventType: input.eventType,
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit || "item",
      rateLabel: formatKsh(line.unitPriceCents),
      totalLabel: formatKsh(line.totalCents),
    })),
    subtotalLabel: formatKsh(input.subtotalCents),
    discountLabel: formatKsh(input.discountCents),
    taxLabel: formatKsh(input.taxCents),
    totalLabel: formatKsh(input.totalCents),
    depositLabel: formatKsh(depositCents),
    balanceLabel: formatKsh(balanceCents),
    showDeposit: depositCents > 0,
    inclusions: (input.inclusions || []).filter(Boolean),
    arrangements: input.arrangements || "",
    requirements: input.clientRequirements || "",
    terms: input.terms.map((term) => ({ title: term.title, content: term.content })),
    validUntil: input.validUntil,
    hqName: input.hq.name,
    hqPhone: input.hq.phone,
    hqEmail: input.hq.email,
    hqAddress: [input.hq.address, input.hq.city].filter(Boolean).join(", "),
  };
}
