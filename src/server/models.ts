import mongoose, { Schema } from "mongoose";

const attachmentSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User" },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    passwordHash: { type: String, default: "" },
    role: { type: String, required: true, index: true },
    jobTitle: { type: String, default: "" },
    status: { type: String, enum: ["invited", "active", "suspended", "deactivated"], default: "active", index: true },
    active: { type: Boolean, default: true, index: true },
    tokenVersion: { type: Number, default: 0 },
    invitedAt: Date,
    joinedAt: Date,
    lastLoginAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    archivedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

const ClientSchema = new Schema(
  {
    kind: { type: String, enum: ["individual", "organization"], required: true },
    name: { type: String, required: true, trim: true, index: true },
    organizationName: { type: String, default: "", index: true },
    phone: { type: String, default: "" },
    phoneNormalized: { type: String, default: "", index: true },
    email: { type: String, default: "", lowercase: true, index: true },
    preferredContact: { type: String, enum: ["phone", "email", "whatsapp"], default: "phone" },
    notes: { type: String, default: "" },
    archivedAt: { type: Date, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

function catalogSchema() {
  return new Schema(
    {
      name: { type: String, required: true, trim: true },
      slug: { type: String, required: true, unique: true },
      active: { type: Boolean, default: true },
      sort: { type: Number, default: 0 },
      description: { type: String, default: "" },
    },
    { timestamps: true },
  );
}

const SpaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    capacity: { type: Number, required: true },
    active: { type: Boolean, default: true, index: true },
    setupNotes: { type: String, default: "" },
    capabilities: { type: [String], default: [] },
  },
  { timestamps: true },
);

const ServiceItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true },
    category: { type: String, default: "Other" },
    description: { type: String, default: "" },
    unitPriceCents: { type: Number, required: true },
    unit: { type: String, default: "item" },
    taxRate: { type: Number, default: 0 },
    taxBehavior: { type: String, default: "default" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const EnquirySchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    contact: {
      fullName: String,
      organization: String,
      phone: String,
      phoneNormalized: { type: String, index: true },
      email: { type: String, index: true },
      preferredContact: String,
    },
    eventTypeId: { type: Schema.Types.ObjectId, ref: "EventType", index: true },
    preferredDate: Date,
    alternativeDate: Date,
    startTime: String,
    endTime: String,
    estimatedGuests: Number,
    spaceIds: [{ type: Schema.Types.ObjectId, ref: "Space" }],
    budgetMinCents: Number,
    budgetMaxCents: Number,
    requirements: { type: String, default: "" },
    notes: { type: String, default: "" },
    sourceId: { type: Schema.Types.ObjectId, ref: "LeadSource", index: true },
    referralDetail: { type: String, default: "" },
    origin: { type: String, default: "internal", index: true },
    experience: { type: String, default: "" },
    requestedServiceIds: [{ type: Schema.Types.ObjectId, ref: "ServiceItem" }],
    attribution: {
      campaign: { type: String, default: "" },
      linkId: { type: Schema.Types.ObjectId, ref: "EnquiryLink" },
      staffId: { type: Schema.Types.ObjectId, ref: "User" },
      submittedAt: Date,
      consentAt: Date,
      consentVersion: { type: String, default: "" },
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    stage: { type: String, required: true, index: true },
    lostReasonId: { type: Schema.Types.ObjectId, ref: "LostReason" },
    lostNotes: { type: String, default: "" },
    estimatedValueCents: { type: Number, default: 0 },
    nextAction: { type: String, default: "" },
    nextActionAt: { type: Date, index: true },
    priority: { type: String, default: "normal", index: true },
    lastContactedAt: Date,
    lastActivityAt: { type: Date, default: Date.now, index: true },
    archivedAt: { type: Date, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

EnquirySchema.index({ archivedAt: 1, stage: 1, updatedAt: -1 });

const SiteVisitSchema = new Schema(
  {
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    assignedToId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    spaceIds: [{ type: Schema.Types.ObjectId, ref: "Space" }],
    notes: { type: String, default: "" },
    status: { type: String, default: "scheduled", index: true },
    outcome: { type: String, default: null },
    outcomeNotes: { type: String, default: "" },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const lineSchema = new Schema(
  {
    serviceItemId: { type: Schema.Types.ObjectId, ref: "ServiceItem" },
    description: String,
    quantity: Number,
    unitPriceCents: Number,
    taxRate: Number,
    discountCents: Number,
    grossCents: Number,
    netCents: Number,
    taxCents: Number,
    totalCents: Number,
    unit: { type: String, default: "item" },
    internalNote: { type: String, default: "" },
  },
  { _id: false },
);

const QuotationSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", index: true },
    spaceIds: [{ type: Schema.Types.ObjectId, ref: "Space" }],
    status: { type: String, required: true, index: true },
    currentVersion: { type: Number, default: 1 },
    validUntil: Date,
    currency: { type: String, default: "KES" },
    notes: { type: String, default: "" },
    terms: { type: String, default: "" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    needsFollowUp: { type: Boolean, default: false, index: true },
    lastActivityAt: { type: Date, default: Date.now },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const QuotationVersionSchema = new Schema(
  {
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation", required: true, index: true },
    version: { type: Number, required: true },
    lines: { type: [lineSchema], default: [] },
    subtotalCents: Number,
    taxCents: Number,
    discountCents: Number,
    headerDiscountCents: { type: Number, default: 0 },
    totalCents: Number,
    status: { type: String, required: true },
    reason: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    inclusions: { type: [String], default: [] },
    arrangements: { type: String, default: "" },
    clientRequirements: { type: String, default: "" },
    termsSnapshot: { type: [{ title: String, content: String, _id: false }], default: [] },
    termsVersion: { type: Number, default: 0 },
    depositCents: { type: Number, default: 0 },
    sentAt: Date,
    sentBy: { type: Schema.Types.ObjectId, ref: "User" },
    validUntil: Date,
    viewedAt: Date,
    lastViewedAt: Date,
    acceptedAt: Date,
    acceptedByName: { type: String, default: "" },
    declinedAt: Date,
    declineReason: { type: String, default: "" },
  },
  { timestamps: true },
);
QuotationVersionSchema.index({ quotationId: 1, version: 1 }, { unique: true });

const ProposalTermSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

const ProposalLinkSchema = new Schema(
  {
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation", required: true, index: true },
    version: { type: Number, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: Date,
    revokedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const BookingSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", index: true },
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation" },
    quotationVersion: Number,
    eventDate: Date,
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true, index: true },
    spaceIds: [{ type: Schema.Types.ObjectId, ref: "Space", index: true }],
    guestCount: Number,
    agreedAmountCents: { type: Number, required: true },
    depositRequiredCents: { type: Number, default: 0 },
    depositReceivedCents: { type: Number, default: 0 },
    amountReceivedCents: { type: Number, default: 0 },
    outstandingCents: { type: Number, default: 0 },
    financialStatus: { type: String, default: "unpaid", index: true },
    paymentDeadline: Date,
    specialConditions: { type: String, default: "" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    status: { type: String, required: true, index: true },
    holdExpiresAt: Date,
    holdReleasedAt: { type: Date, default: null },
    holdExpired: { type: Boolean, default: false },
    cancellationReason: { type: String, default: "" },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
BookingSchema.index({ spaceIds: 1, status: 1, startAt: 1 });

const EventSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry" },
    eventTypeId: { type: Schema.Types.ObjectId, ref: "EventType" },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    spaceIds: [{ type: Schema.Types.ObjectId, ref: "Space" }],
    guestCount: Number,
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    staffIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, default: "planning", index: true },
    preparationStatus: { type: String, default: "on_track" },
    requirements: { type: [{ label: String, value: String }], default: [] },
    notes: { type: String, default: "" },
    documents: { type: [attachmentSchema], default: [] },
    closeout: {
      items: {
        type: [{ key: String, label: String, done: Boolean, doneBy: Schema.Types.ObjectId, doneAt: Date }],
        default: [],
      },
      notes: { type: String, default: "" },
      completedAt: Date,
    },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const TaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    dueAt: { type: Date, index: true },
    priority: { type: String, default: "normal" },
    status: { type: String, default: "todo", index: true },
    relatedType: { type: String, default: "general", index: true },
    relatedId: { type: Schema.Types.ObjectId, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    completedBy: { type: Schema.Types.ObjectId, ref: "User" },
    completedAt: Date,
    source: { type: String, default: "manual" },
    automationKey: { type: String },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
TaskSchema.index({ automationKey: 1 }, { unique: true, sparse: true });

const InventoryItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "InventoryCategory", index: true },
    description: { type: String, default: "" },
    assetType: { type: String, enum: ["durable", "consumable"], default: "durable" },
    condition: { type: String, default: "available" },
    quantityOnHand: { type: Number, default: 0 },
    quantityReserved: { type: Number, default: 0 },
    quantityCheckedOut: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    unitCostCents: { type: Number, default: 0 },
    preferredVendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    location: { type: String, default: "" },
    active: { type: Boolean, default: true, index: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const StockMovementSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    type: { type: String, required: true, index: true },
    quantity: { type: Number, required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event" },
    reason: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    balanceAfter: { type: Schema.Types.Mixed },
    override: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const InventoryReservationSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    quantityReserved: { type: Number, default: 0 },
    quantityIssued: { type: Number, default: 0 },
    quantityReturned: { type: Number, default: 0 },
    quantityDamaged: { type: Number, default: 0 },
    quantityLost: { type: Number, default: 0 },
    status: { type: String, default: "reserved", index: true },
    overrideBy: { type: Schema.Types.ObjectId, ref: "User" },
    overrideReason: { type: String, default: "" },
  },
  { timestamps: true },
);
InventoryReservationSchema.index({ itemId: 1, eventId: 1 }, { unique: true });

const VendorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    contactName: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    categoryId: { type: Schema.Types.ObjectId, ref: "VendorCategory", index: true },
    services: { type: [String], default: [] },
    pricingNotes: { type: String, default: "" },
    paymentTerms: { type: String, default: "" },
    documents: { type: [attachmentSchema], default: [] },
    active: { type: Boolean, default: true, index: true },
    preferred: { type: Boolean, default: false },
    notes: { type: String, default: "" },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const EventVendorSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    service: { type: String, required: true },
    quotedCostCents: { type: Number, default: 0 },
    agreedCostCents: { type: Number, default: 0 },
    paymentStatus: { type: String, default: "unpaid" },
    confirmationStatus: { type: String, default: "requested", index: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

const ProcurementSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    item: { type: String, required: true },
    quantity: { type: Number, required: true },
    reason: { type: String, required: true },
    estimatedCostCents: { type: Number, default: 0 },
    finalCostCents: Number,
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", index: true },
    relatedType: { type: String, default: "general" },
    requesterId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    approverId: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, default: "requested", index: true },
    history: {
      type: [{ action: String, actorId: Schema.Types.ObjectId, at: Date, note: String }],
      default: [],
    },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const PaymentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event" },
    type: { type: String, required: true, index: true },
    amountCents: { type: Number, required: true },
    methodId: { type: Schema.Types.ObjectId, ref: "PaymentMethod" },
    paidAt: { type: Date, required: true, index: true },
    reference: { type: String, default: "" },
    notes: { type: String, default: "" },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

const EventCostSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    eventVendorId: { type: Schema.Types.ObjectId, ref: "EventVendor" },
    amountCents: { type: Number, required: true },
    incurredAt: { type: Date, default: Date.now },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    href: { type: String, default: "" },
    readAt: { type: Date, default: null, index: true },
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
NotificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

const ActivitySchema = new Schema(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    kind: { type: String, default: "system" },
    summary: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const AuditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    reason: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

function blockAuditMutation() {
  throw new Error("Audit records cannot be modified.");
}
for (const hook of ["updateOne", "updateMany", "findOneAndUpdate", "deleteOne", "deleteMany", "replaceOne"] as const) {
  AuditSchema.pre(hook, blockAuditMutation);
}

const SettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const ApprovalSchema = new Schema(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    actionType: { type: String, required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedAt: { type: Date, default: Date.now },
    reason: { type: String, default: "" },
    originalValue: { type: Schema.Types.Mixed },
    proposedValue: { type: Schema.Types.Mixed },
    status: { type: String, default: "pending", index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewerNotes: { type: String, default: "" },
  },
  { timestamps: true },
);

const OverrideSchema = new Schema(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    reason: { type: String, required: true },
    permission: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

const EnquiryLinkSchema = new Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    sourceId: { type: Schema.Types.ObjectId, ref: "LeadSource", required: true, index: true },
    campaign: { type: String, default: "" },
    staffId: { type: Schema.Types.ObjectId, ref: "User" },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const InvitationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    devPreviewUrl: { type: String, default: "" },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const CounterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

function register(name: string, schema: Schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const User = register("User", UserSchema);
export const Invitation = register("Invitation", InvitationSchema);
export const Client = register("Client", ClientSchema);
export const EventType = register("EventType", catalogSchema());
export const LeadSource = register("LeadSource", catalogSchema());
export const LostReason = register("LostReason", catalogSchema());
export const InventoryCategory = register("InventoryCategory", catalogSchema());
export const VendorCategory = register("VendorCategory", catalogSchema());
export const PaymentMethod = register("PaymentMethod", catalogSchema());
export const Space = register("Space", SpaceSchema);
export const ServiceItem = register("ServiceItem", ServiceItemSchema);
export const Enquiry = register("Enquiry", EnquirySchema);
export const EnquiryLink = register("EnquiryLink", EnquiryLinkSchema);
export const SiteVisit = register("SiteVisit", SiteVisitSchema);
export const Quotation = register("Quotation", QuotationSchema);
export const QuotationVersion = register("QuotationVersion", QuotationVersionSchema);
export const ProposalTerm = register("ProposalTerm", ProposalTermSchema);
export const ProposalLink = register("ProposalLink", ProposalLinkSchema);
export const Booking = register("Booking", BookingSchema);
export const EventRecord = register("Event", EventSchema);
export const Task = register("Task", TaskSchema);
export const InventoryItem = register("InventoryItem", InventoryItemSchema);
export const StockMovement = register("StockMovement", StockMovementSchema);
export const InventoryReservation = register("InventoryReservation", InventoryReservationSchema);
export const Vendor = register("Vendor", VendorSchema);
export const EventVendor = register("EventVendor", EventVendorSchema);
export const ProcurementRequest = register("ProcurementRequest", ProcurementSchema);
export const Payment = register("Payment", PaymentSchema);
export const EventCost = register("EventCost", EventCostSchema);
export const Notification = register("Notification", NotificationSchema);
export const ActivityEvent = register("ActivityEvent", ActivitySchema);
export const AuditLog = register("AuditLog", AuditSchema);
export const ApprovalRequest = register("ApprovalRequest", ApprovalSchema);
export const OverrideLog = register("OverrideLog", OverrideSchema);
export const SystemSetting = register("SystemSetting", SettingSchema);
export const Counter = register("Counter", CounterSchema);
