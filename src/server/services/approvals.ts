import { APPROVAL_ACTIONS, COMMERCIAL_APPROVALS, OPERATIONAL_APPROVALS, type ApprovalAction } from "../../domain/approvals";
import { can, type Role } from "../../domain/permissions";
import type { SessionUser } from "../auth";
import { recordActivity, recordAudit } from "../audit";
import { connectDB } from "../db";
import { AppError } from "../errors";
import { ApprovalRequest } from "../models";
import { sid } from "../parse";

export function canReviewApproval(role: Role, actionType: ApprovalAction): boolean {
  if (can(role, "approvals.review")) return true;
  if (COMMERCIAL_APPROVALS.has(actionType) && can(role, "approvals.review_commercial")) return true;
  if (OPERATIONAL_APPROVALS.has(actionType) && can(role, "approvals.review_operations")) return true;
  return false;
}

export async function submitApproval(actor: SessionUser, input: {
  entityType: string;
  entityId: string;
  actionType: ApprovalAction;
  reason: string;
  originalValue?: unknown;
  proposedValue?: unknown;
}) {
  await connectDB();
  if (!APPROVAL_ACTIONS.includes(input.actionType)) throw new AppError("That action cannot be sent for approval.");
  const existing = await ApprovalRequest.findOne({
    entityType: input.entityType,
    entityId: input.entityId,
    actionType: input.actionType,
    status: "pending",
  });
  if (existing) return sid(existing._id);
  const request = await ApprovalRequest.create({
    entityType: input.entityType,
    entityId: input.entityId,
    actionType: input.actionType,
    requestedBy: actor.id,
    reason: input.reason,
    originalValue: input.originalValue,
    proposedValue: input.proposedValue,
    status: "pending",
  });
  await recordAudit({
    actorId: actor.id,
    action: "approval.request",
    entityType: input.entityType,
    entityId: input.entityId,
    newValue: { approvalId: sid(request._id), actionType: input.actionType, proposedValue: input.proposedValue },
    reason: input.reason,
  });
  await recordActivity({
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: actor.id,
    kind: "approval",
    summary: `Approval requested for ${input.actionType.replaceAll("_", " ")}. ${input.reason}`,
  });
  return sid(request._id);
}

export async function listApprovals(actor: SessionUser) {
  await connectDB();
  const rows = await ApprovalRequest.find().sort({ createdAt: -1 }).limit(200).lean();
  return rows.filter((row) => canReviewApproval(actor.role, row.actionType as ApprovalAction) || sid(row.requestedBy) === actor.id);
}

async function applyApproved(actor: SessionUser, request: {
  actionType: string;
  entityId: string;
  reason?: string;
  proposedValue?: unknown;
  _id: unknown;
}) {
  const proposed = (request.proposedValue || {}) as Record<string, unknown>;
  if (request.actionType === "confirm_without_deposit") {
    const { confirmBooking } = await import("./commercial");
    await confirmBooking(actor, request.entityId, { approvalId: sid(request._id) });
    return;
  }
  if (request.actionType === "refund") {
    const { recordPaymentAndMaybeConfirm } = await import("./commercial");
    await recordPaymentAndMaybeConfirm(actor, {
      clientId: String(proposed.clientId),
      bookingId: String(proposed.bookingId),
      type: "refund",
      amountCents: Number(proposed.amountCents),
      methodId: String(proposed.methodId),
      paidAt: new Date(String(proposed.paidAt)),
      reference: String(proposed.reference || ""),
      notes: String(proposed.notes || ""),
      idempotencyKey: `approval:${sid(request._id)}`,
      approved: true,
    });
    return;
  }
  if (request.actionType === "inventory_writeoff") {
    const { moveStock } = await import("./inventory");
    await moveStock(actor, {
      itemId: String(proposed.itemId),
      type: proposed.type === "loss" ? "loss" : "damage",
      quantity: Number(proposed.quantity),
      reason: String(proposed.reason || "Approved write-off"),
      eventId: proposed.eventId ? String(proposed.eventId) : undefined,
      approved: true,
    });
    return;
  }
  if (request.actionType === "hold_extension") {
    const { applyApprovedHoldExtension } = await import("./commercial");
    await applyApprovedHoldExtension(actor, request.entityId, new Date(String(proposed.holdExpiresAt)), String(request.reason || ""));
    return;
  }
  if (request.actionType === "procurement_threshold") {
    const { setProcurementStatus } = await import("./events");
    await setProcurementStatus(actor, request.entityId, "approved", "Approved through the approval register.", undefined, true);
  }
}

export async function reviewApproval(actor: SessionUser, id: string, decision: "approved" | "rejected", notes: string) {
  await connectDB();
  const request = await ApprovalRequest.findById(id);
  if (!request) throw new AppError("Approval request not found.", "not_found");
  if (request.status !== "pending") throw new AppError("That request has already been reviewed.");
  if (!canReviewApproval(actor.role, request.actionType as ApprovalAction)) {
    throw new AppError("You cannot review this approval.", "forbidden");
  }
  if (decision === "approved") await applyApproved(actor, request);
  request.status = decision;
  request.reviewedBy = actor.id;
  request.reviewedAt = new Date();
  request.reviewerNotes = notes;
  await request.save();
  await recordAudit({
    actorId: actor.id,
    action: `approval.${decision}`,
    entityType: request.entityType,
    entityId: request.entityId,
    previousValue: { status: "pending" },
    newValue: { status: decision, approvalId: sid(request._id), actionType: request.actionType },
    reason: notes,
  });
  await recordActivity({
    entityType: request.entityType,
    entityId: request.entityId,
    actorId: actor.id,
    kind: "approval",
    summary: `Approval ${decision} for ${String(request.actionType).replaceAll("_", " ")}. ${notes}`,
  });
}
