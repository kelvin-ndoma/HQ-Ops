export type DepositRule = {
  mode: "percent" | "fixed" | "none";
  percent: number | null;
  fixedCents: number | null;
};

export type PricedLine = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRate: number;
  discountCents: number;
  grossCents: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
};

export function shillingsToCents(shillings: number): number {
  return Math.round(shillings * 100);
}

export function centsToShillings(cents: number): number {
  return cents / 100;
}

export function formatKsh(cents: number): string {
  const hasCents = cents % 100 !== 0;
  const formatted = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(cents / 100);
  return `KSh ${formatted}`;
}

export function priceLine(input: {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRate: number;
  discountCents: number;
}): PricedLine {
  if (input.quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }
  if (input.unitPriceCents < 0 || input.discountCents < 0 || input.taxRate < 0) {
    throw new Error("Prices, discounts, and tax cannot be negative.");
  }
  const grossCents = Math.round(input.quantity * input.unitPriceCents);
  const discountCents = Math.min(input.discountCents, grossCents);
  const netCents = grossCents - discountCents;
  const taxCents = Math.round(netCents * input.taxRate);
  return {
    description: input.description,
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    taxRate: input.taxRate,
    discountCents,
    grossCents,
    netCents,
    taxCents,
    totalCents: netCents + taxCents,
  };
}

export function priceQuotation(
  lines: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    taxRate: number;
    discountCents: number;
  }>,
  headerDiscountCents = 0,
) {
  if (lines.length === 0) {
    throw new Error("A quotation needs at least one line.");
  }
  const priced = lines.map(priceLine);
  const subtotalCents = priced.reduce((sum, line) => sum + line.netCents, 0);
  const taxCents = priced.reduce((sum, line) => sum + line.taxCents, 0);
  const lineDiscountCents = priced.reduce((sum, line) => sum + line.discountCents, 0);
  const header = Math.max(0, Math.min(headerDiscountCents, subtotalCents + taxCents));
  return {
    lines: priced,
    subtotalCents,
    taxCents,
    discountCents: lineDiscountCents + header,
    headerDiscountCents: header,
    totalCents: subtotalCents + taxCents - header,
  };
}

export function requiredDeposit(agreedCents: number, rule: DepositRule): number {
  if (agreedCents < 0) throw new Error("Agreed amount cannot be negative.");
  if (rule.mode === "none") return 0;
  if (rule.mode === "fixed") return Math.min(agreedCents, Math.max(0, rule.fixedCents ?? 0));
  if (rule.percent == null) return 0;
  return Math.round(agreedCents * (rule.percent / 100));
}

export type PaymentLike = { type: "deposit" | "balance" | "additional_charge" | "refund"; amountCents: number };

export function summarizePayments(payments: PaymentLike[], agreedCents: number) {
  const receivedCents = payments
    .filter((payment) => payment.type !== "refund")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const refundedCents = payments
    .filter((payment) => payment.type === "refund")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const netCents = receivedCents - refundedCents;
  const depositCents = payments
    .filter((payment) => payment.type === "deposit")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const outstandingCents = agreedCents - netCents;
  let financialStatus: "unpaid" | "partially_paid" | "paid" | "refunded" = "unpaid";
  if (refundedCents > 0 && netCents <= 0) financialStatus = "refunded";
  else if (netCents <= 0) financialStatus = "unpaid";
  else if (netCents + 1 < agreedCents) financialStatus = "partially_paid";
  else financialStatus = "paid";
  return { receivedCents, refundedCents, netCents, depositCents, outstandingCents, financialStatus };
}

export function eventContribution(revenueCents: number, directCostCents: number) {
  const grossContributionCents = revenueCents - directCostCents;
  const margin = revenueCents === 0 ? 0 : grossContributionCents / revenueCents;
  return { revenueCents, directCostCents, grossContributionCents, margin };
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}
