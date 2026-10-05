"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addCostAction, createProcurementAction, procurementStatusAction, recordPaymentAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function PaymentForm({ bookings, methods, preset }: { bookings: { id: string; clientId: string; label: string }[]; methods: { id: string; name: string }[]; preset?: { bookingId?: string; clientId?: string } }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const booking = bookings.find((item) => item.id === String(form.get("bookingId")));
      const result = await recordPaymentAction({
        clientId: booking?.clientId || preset?.clientId || "",
        bookingId: String(form.get("bookingId")),
        type: String(form.get("type")),
        amountShillings: Number(form.get("amount")),
        methodId: String(form.get("methodId")),
        paidAt: String(form.get("paidAt")),
        reference: String(form.get("reference") || ""),
        notes: String(form.get("notes") || ""),
        idempotencyKey: key,
      });
      if (!result.ok) setError(result.error);
      else router.push("/payments");
    }}>
      <Field label="Booking"><Select name="bookingId" defaultValue={preset?.bookingId}>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.label}</option>)}</Select></Field>
      <Field label="Type"><Select name="type"><option value="deposit">Deposit</option><option value="balance">Balance</option><option value="additional_charge">Additional charge</option><option value="refund">Refund</option></Select></Field>
      <Field label="Amount (KSh)"><Input name="amount" type="number" required /></Field>
      <Field label="Method"><Select name="methodId">{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</Select></Field>
      <Field label="Date"><Input name="paidAt" type="date" required /></Field>
      <Field label="Reference"><Input name="reference" placeholder="M-Pesa code or bank slip" /></Field>
      <Field label="Notes"><Textarea name="notes" /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Record payment</Button>
    </form>
  );
}

export function ProcurementForm({ vendors, events }: { vendors: { id: string; name: string }[]; events: { id: string; label: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await createProcurementAction({
        item: String(form.get("item")),
        quantity: Number(form.get("quantity")),
        reason: String(form.get("reason")),
        estimatedShillings: Number(form.get("estimated") || 0),
        vendorId: String(form.get("vendorId") || ""),
        eventId: String(form.get("eventId") || ""),
        relatedType: String(form.get("relatedType")),
      });
      if (!result.ok) setError(result.error);
      else router.push("/procurement");
    }}>
      <Field label="Item or service"><Input name="item" required /></Field>
      <Field label="Quantity"><Input name="quantity" type="number" required /></Field>
      <Field label="Why"><Textarea name="reason" required /></Field>
      <Field label="Estimated cost (KSh)"><Input name="estimated" type="number" /></Field>
      <Field label="Vendor"><Select name="vendorId"><option value="">None yet</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></Field>
      <Field label="Event"><Select name="eventId"><option value="">General operations</option>{events.map((event) => <option key={event.id} value={event.id}>{event.label}</option>)}</Select></Field>
      <Field label="Relates to"><Select name="relatedType"><option value="event">Event</option><option value="inventory">Inventory</option><option value="general">General operations</option></Select></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Request</Button>
    </form>
  );
}

export function ProcurementDecision({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="flex flex-wrap gap-2" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await procurementStatusAction({ id, status: String(form.get("status")), note: String(form.get("note") || ""), finalShillings: form.get("final") ? Number(form.get("final")) : undefined });
      if (!result.ok) setError(result.error);
      else router.refresh();
    }}>
      <Select name="status"><option value="approved">Approve</option><option value="rejected">Reject</option><option value="ordered">Ordered</option><option value="received">Received</option><option value="cancelled">Cancel</option></Select>
      <Input name="note" placeholder="Note" />
      <Input name="final" type="number" placeholder="Final KSh" />
      <Button type="submit" variant="secondary">Update</Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export function CostForm({ events, vendors, eventId }: { events: { id: string; label: string }[]; vendors: { id: string; name: string }[]; eventId?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await addCostAction({
        eventId: String(form.get("eventId")),
        category: String(form.get("category")),
        description: String(form.get("description")),
        amountShillings: Number(form.get("amount")),
        vendorId: String(form.get("vendorId") || ""),
      });
      if (!result.ok) setError(result.error);
      else router.push(`/events/${form.get("eventId")}`);
    }}>
      <Field label="Event"><Select name="eventId" defaultValue={eventId}>{events.map((event) => <option key={event.id} value={event.id}>{event.label}</option>)}</Select></Field>
      <Field label="Category"><Input name="category" placeholder="Catering, décor, staffing…" required /></Field>
      <Field label="Description"><Input name="description" required /></Field>
      <Field label="Amount (KSh)"><Input name="amount" type="number" required /></Field>
      <Field label="Vendor"><Select name="vendorId"><option value="">None</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Add cost</Button>
    </form>
  );
}
