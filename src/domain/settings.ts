import type { DepositRule } from "./money";
import type { PrepTaskTemplate } from "./operations";

/**
 * These values are the initial configuration written by the seed, and the
 * fallback when a setting has not been saved yet. Workflows always read the
 * stored setting. Deposit mode defaults to "none" so a percentage is never
 * invented in code.
 */
export const SETTING_KEYS = {
  organization: "organization",
  commercial: "commercial",
  automation: "automation",
  notifications: "notifications",
  assignment: "assignment",
} as const;

export type OrganizationSettings = {
  name: string;
  legalName: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  currency: string;
  timezone: string;
};

export type ApprovalThresholds = {
  maxDiscountPercent: number | null;
  inventoryWriteOffCents: number | null;
  procurementCents: number | null;
  minimumUnitPriceCents: number | null;
  refundCents: number | null;
};

export type CommercialSettings = {
  quotationValidityDays: number;
  taxEnabled: boolean;
  defaultTaxRate: number;
  defaultTerms: string;
  holdDurationHours: number;
  staleEnquiryDays: number;
  deposit: DepositRule;
  approvals: ApprovalThresholds;
};

export type AutomationSettings = {
  newEnquiryFollowUpHours: number;
  visitReminderHours: number;
  postVisitFollowUpHours: number;
  quoteFollowUpDays: number;
  quoteInactivityDays: number;
  depositFollowUpDays: number;
  preparationTasks: PrepTaskTemplate[];
  closeoutChecklist: { key: string; label: string }[];
};

export type NotificationSettings = {
  inApp: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
};

export type AssignmentSettings = {
  defaultOwnerId: string | null;
};

export const DEFAULT_ORGANIZATION: OrganizationSettings = {
  name: "HQ",
  legalName: "HQ",
  address: "",
  city: "Nairobi",
  phone: "",
  email: "",
  website: "",
  currency: "KES",
  timezone: "Africa/Nairobi",
};

export const DEFAULT_COMMERCIAL: CommercialSettings = {
  quotationValidityDays: 14,
  taxEnabled: false,
  defaultTaxRate: 0,
  defaultTerms:
    "This quotation is valid until the date shown. Space is held only after HQ confirms a booking. A booking is confirmed when the configured deposit has been received. Amounts are in Kenyan Shillings.",
  holdDurationHours: 72,
  staleEnquiryDays: 7,
  deposit: { mode: "none", percent: null, fixedCents: null },
  approvals: {
    maxDiscountPercent: null,
    inventoryWriteOffCents: null,
    procurementCents: null,
    minimumUnitPriceCents: null,
    refundCents: null,
  },
};

/** Written by the development seed only. These are not HQ's commercial policy. */
export const DEMO_APPROVAL_THRESHOLDS: ApprovalThresholds = {
  maxDiscountPercent: 10,
  inventoryWriteOffCents: 1_000_000,
  procurementCents: 5_000_000,
  minimumUnitPriceCents: null,
  refundCents: 1_000_000,
};

export const DEFAULT_AUTOMATION: AutomationSettings = {
  newEnquiryFollowUpHours: 24,
  visitReminderHours: 24,
  postVisitFollowUpHours: 24,
  quoteFollowUpDays: 3,
  quoteInactivityDays: 5,
  depositFollowUpDays: 2,
  preparationTasks: [
    { key: "requirements", label: "Confirm event requirements", offsetDays: -14 },
    { key: "vendors", label: "Confirm vendors", offsetDays: -7 },
    { key: "hospitality", label: "Confirm hospitality and catering", offsetDays: -5 },
    { key: "inventory", label: "Verify inventory", offsetDays: -3 },
    { key: "setup", label: "Final setup confirmation", offsetDays: -1 },
    { key: "opening", label: "Opening and event-day checklist", offsetDays: 0 },
    { key: "reconcile", label: "Inventory reconciliation", offsetDays: 1 },
    { key: "balance", label: "Outstanding payment check", offsetDays: 1 },
    { key: "feedback", label: "Request client feedback", offsetDays: 2 },
    { key: "repeat", label: "Repeat and referral follow-up", offsetDays: 7 },
  ],
  closeoutChecklist: [
    { key: "inventory", label: "Inventory reconciled" },
    { key: "vendors", label: "Vendor completion confirmed" },
    { key: "payment", label: "Outstanding client balance reviewed" },
    { key: "feedback", label: "Client feedback requested" },
    { key: "site", label: "Space handed back" },
  ],
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  inApp: true,
  emailEnabled: false,
  whatsappEnabled: false,
};

export const DEFAULT_ASSIGNMENT: AssignmentSettings = {
  defaultOwnerId: null,
};

export const INITIAL_SOURCES = [
  "Website",
  "Instagram",
  "WhatsApp",
  "Phone",
  "Email",
  "Walk-in",
  "Referral",
  "Returning Client",
  "Other",
];

export const INITIAL_LOST_REASONS = [
  "Price",
  "Date unavailable",
  "Capacity",
  "Location",
  "Facilities",
  "Catering",
  "Competitor",
  "Client stopped responding",
  "Event cancelled",
  "Other",
];

export const INITIAL_EVENT_TYPES = [
  "Wedding",
  "Corporate",
  "Birthday",
  "Cocktail",
  "Private Dinner",
  "Gala",
  "Workshop",
  "Memorial",
  "Other",
];

export const INITIAL_INVENTORY_CATEGORIES = [
  "Furniture",
  "AV/Electronics",
  "Service Equipment",
  "Glassware",
  "Décor",
  "Linen",
  "Cleaning",
  "Office",
  "Consumables",
  "Other",
];

export const INITIAL_VENDOR_CATEGORIES = [
  "Catering",
  "Artcaffé",
  "Décor",
  "AV",
  "Photography",
  "Security",
  "Cleaning",
  "Furniture Hire",
  "Entertainment",
  "Florist",
  "Transport",
  "Maintenance",
  "Other",
];

export const INITIAL_PAYMENT_METHODS = ["Bank transfer", "M-Pesa", "Card", "Cash", "Cheque"];
