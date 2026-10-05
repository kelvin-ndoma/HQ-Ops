import { applyStockMovement, availableOf, type StockState } from "../../domain/operations";
import type { SessionUser } from "../auth";
import { onLowStock } from "../automation";
import { recordActivity, recordAudit } from "../audit";
import { connectDB } from "../db";
import { AppError } from "../errors";
import { EventRecord, InventoryItem, InventoryReservation, StockMovement } from "../models";
import { sid } from "../parse";
import { can } from "../../domain/permissions";

function stateOf(item: { quantityOnHand: number; quantityReserved: number; quantityCheckedOut: number }): StockState {
  return {
    onHand: item.quantityOnHand,
    reserved: item.quantityReserved,
    checkedOut: item.quantityCheckedOut,
  };
}

function writeState(item: { quantityOnHand: number; quantityReserved: number; quantityCheckedOut: number }, state: StockState) {
  item.quantityOnHand = state.onHand;
  item.quantityReserved = state.reserved;
  item.quantityCheckedOut = state.checkedOut;
}

async function apply(actor: SessionUser, itemId: string, movement: Parameters<typeof applyStockMovement>[1], reason: string, eventId?: string, override = false) {
  if (override && !can(actor.role, "inventory.override")) {
    throw new AppError("You cannot override available stock.", "forbidden");
  }
  const item = await InventoryItem.findOne({ _id: itemId, archivedAt: null });
  if (!item || !item.active) throw new AppError("Inventory item not found.", "not_found");
  const previous = stateOf(item);
  const result = applyStockMovement(previous, movement, override);
  if (!result.ok) throw new AppError(result.error);
  const updated = await InventoryItem.findOneAndUpdate(
    {
      _id: item._id,
      quantityOnHand: previous.onHand,
      quantityReserved: previous.reserved,
      quantityCheckedOut: previous.checkedOut,
    },
    {
      quantityOnHand: result.state.onHand,
      quantityReserved: result.state.reserved,
      quantityCheckedOut: result.state.checkedOut,
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new AppError("Stock changed while this was being saved. Try again.", "conflict");
  const qty = "qty" in movement ? movement.qty : Math.abs(movement.delta);
  await StockMovement.create({
    itemId: item._id,
    type: movement.type,
    quantity: qty,
    eventId: eventId || undefined,
    reason,
    userId: actor.id,
    balanceAfter: result.state,
    override,
  });
  await recordAudit({
    actorId: actor.id,
    action: `inventory.${movement.type}`,
    entityType: "inventory",
    entityId: itemId,
    previousValue: previous,
    newValue: result.state,
    reason,
  });
  if (availableOf(result.state) <= updated.reorderLevel) await onLowStock(updated);
  return updated;
}

export async function createItem(actor: SessionUser, input: {
  name: string;
  sku: string;
  categoryId: string;
  description?: string;
  assetType: "durable" | "consumable";
  quantity: number;
  reorderLevel: number;
  unitCostCents: number;
  location?: string;
  preferredVendorId?: string;
}) {
  await connectDB();
  const item = await InventoryItem.create({
    name: input.name,
    sku: input.sku,
    categoryId: input.categoryId,
    description: input.description || "",
    assetType: input.assetType,
    quantityOnHand: input.quantity,
    reorderLevel: input.reorderLevel,
    unitCostCents: input.unitCostCents,
    location: input.location || "",
    preferredVendorId: input.preferredVendorId || undefined,
    condition: "available",
  });
  if (input.quantity > 0) {
    await StockMovement.create({
      itemId: item._id,
      type: "stock_in",
      quantity: input.quantity,
      reason: "Opening stock",
      userId: actor.id,
      balanceAfter: stateOf(item),
    });
  }
  await recordAudit({
    actorId: actor.id,
    action: "inventory.create",
    entityType: "inventory",
    entityId: sid(item._id),
    newValue: { sku: item.sku, quantity: input.quantity },
  });
  return sid(item._id);
}

export async function listItems() {
  await connectDB();
  const items = await InventoryItem.find({ archivedAt: null }).sort({ name: 1 }).lean();
  return items.map((item) => ({ ...item, available: item.quantityOnHand - item.quantityReserved - item.quantityCheckedOut }));
}

export async function getItem(id: string) {
  await connectDB();
  const item = await InventoryItem.findOne({ _id: id, archivedAt: null }).lean();
  if (!item) throw new AppError("Inventory item not found.", "not_found");
  const [movements, reservations] = await Promise.all([
    StockMovement.find({ itemId: id }).sort({ createdAt: -1 }).limit(50).lean(),
    InventoryReservation.find({ itemId: id }).lean(),
  ]);
  return {
    item: { ...item, available: item.quantityOnHand - item.quantityReserved - item.quantityCheckedOut },
    movements,
    reservations,
  };
}

export async function moveStock(actor: SessionUser, input: {
  itemId: string;
  type: "stock_in" | "stock_out" | "adjustment" | "damage" | "loss";
  quantity: number;
  reason: string;
  eventId?: string;
  override?: boolean;
}) {
  await connectDB();
  if (input.type === "adjustment") {
    return apply(actor, input.itemId, { type: "adjustment", delta: input.quantity }, input.reason, input.eventId, input.override);
  }
  if (input.type === "damage" || input.type === "loss") {
    return apply(actor, input.itemId, { type: input.type, qty: input.quantity, from: input.eventId ? "checked_out" : "on_hand" }, input.reason, input.eventId, input.override);
  }
  return apply(actor, input.itemId, { type: input.type, qty: input.quantity }, input.reason, input.eventId, input.override);
}

function reservationStatus(row: { quantityReserved: number; quantityIssued: number; quantityReturned: number; quantityDamaged: number; quantityLost: number }) {
  const openIssue = row.quantityIssued - row.quantityReturned - row.quantityDamaged - row.quantityLost;
  if (row.quantityReserved === 0 && row.quantityIssued > 0 && openIssue === 0) return "reconciled";
  if (row.quantityIssued > 0 && row.quantityReserved > 0) return "partially_issued";
  if (row.quantityIssued > 0) return "issued";
  return "reserved";
}

export async function reserveForEvent(actor: SessionUser, input: { eventId: string; itemId: string; quantity: number; override?: boolean; reason?: string }) {
  await connectDB();
  const event = await EventRecord.findById(input.eventId);
  if (!event) throw new AppError("Event not found.", "not_found");
  if (input.override && !input.reason) throw new AppError("An override needs a reason.");
  let reservation = await InventoryReservation.findOne({ eventId: input.eventId, itemId: input.itemId });
  if (!reservation) {
    reservation = new InventoryReservation({ eventId: input.eventId, itemId: input.itemId });
  }
  await apply(actor, input.itemId, { type: "reserve", qty: input.quantity }, input.reason || `Reserved for ${event.reference}`, input.eventId, input.override);
  reservation.quantityReserved += input.quantity;
  if (input.override) {
    reservation.overrideBy = actor.id;
    reservation.overrideReason = input.reason || "";
  }
  reservation.status = reservationStatus(reservation);
  await reservation.save();
  await recordActivity({
    entityType: "event",
    entityId: input.eventId,
    actorId: actor.id,
    summary: `Reserved ${input.quantity} for ${event.reference}.`,
  });
}

export async function issueReserved(actor: SessionUser, reservationId: string, quantity: number) {
  await connectDB();
  const reservation = await InventoryReservation.findById(reservationId);
  if (!reservation) throw new AppError("Reservation not found.", "not_found");
  if (quantity > reservation.quantityReserved) throw new AppError("Cannot issue more than is still reserved.");
  await apply(actor, sid(reservation.itemId), { type: "event_issue", qty: quantity }, "Issued to event", sid(reservation.eventId));
  reservation.quantityReserved -= quantity;
  reservation.quantityIssued += quantity;
  reservation.status = reservationStatus(reservation);
  await reservation.save();
}

export async function returnIssued(actor: SessionUser, reservationId: string, quantity: number, damaged = 0, lost = 0) {
  await connectDB();
  const reservation = await InventoryReservation.findById(reservationId);
  if (!reservation) throw new AppError("Reservation not found.", "not_found");
  const outstanding = reservation.quantityIssued - reservation.quantityReturned - reservation.quantityDamaged - reservation.quantityLost;
  if (quantity + damaged + lost > outstanding) throw new AppError("Return, damage, and loss cannot exceed what is still out.");
  if (quantity > 0) {
    await apply(actor, sid(reservation.itemId), { type: "event_return", qty: quantity }, "Returned from event", sid(reservation.eventId));
    reservation.quantityReturned += quantity;
  }
  if (damaged > 0) {
    await apply(actor, sid(reservation.itemId), { type: "damage", qty: damaged, from: "checked_out" }, "Damaged during event", sid(reservation.eventId));
    reservation.quantityDamaged += damaged;
  }
  if (lost > 0) {
    await apply(actor, sid(reservation.itemId), { type: "loss", qty: lost, from: "checked_out" }, "Lost during event", sid(reservation.eventId));
    reservation.quantityLost += lost;
  }
  reservation.status = reservationStatus(reservation);
  await reservation.save();
  await recordActivity({
    entityType: "event",
    entityId: sid(reservation.eventId),
    actorId: actor.id,
    summary: `Inventory reconciliation recorded. Returned ${quantity}, damaged ${damaged}, lost ${lost}.`,
  });
}

export async function releaseReservation(actor: SessionUser, reservationId: string) {
  await connectDB();
  const reservation = await InventoryReservation.findById(reservationId);
  if (!reservation || reservation.quantityReserved <= 0) return;
  await apply(actor, sid(reservation.itemId), { type: "release", qty: reservation.quantityReserved }, "Reservation released", sid(reservation.eventId));
  reservation.quantityReserved = 0;
  reservation.status = reservation.status === "reserved" ? "cancelled" : reservationStatus(reservation);
  await reservation.save();
}

void writeState;
