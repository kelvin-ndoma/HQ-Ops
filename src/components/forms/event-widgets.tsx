"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeoutAction, eventStatusAction, issueAction, reserveAction, returnAction, saveRequirementsAction, setTaskStatusAction, vendorStatusAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function EventActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await eventStatusAction(id, String(form.get("status")) as "planning");
      if (!result.ok) setError(result.error);
      else router.refresh();
    }}>
      <Select name="status" defaultValue={status}>
        {["planning", "ready", "live", "completed", "closed", "cancelled"].map((value) => <option key={value} value={value}>{value}</option>)}
      </Select>
      <Button type="submit" variant="secondary">Update status</Button>
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </form>
  );
}

export function RequirementsForm({ id, notes, requirements }: { id: string; notes: string; requirements: { label: string; value: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(requirements.length ? requirements : [{ label: "", value: "" }]);
  const [text, setText] = useState(notes);
  return (
    <form className="space-y-2" onSubmit={async (event) => {
      event.preventDefault();
      await saveRequirementsAction(id, rows.filter((row) => row.label && row.value), text);
      router.refresh();
    }}>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 md:grid-cols-2">
          <Input value={row.label} placeholder="Requirement" onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
          <Input value={row.value} placeholder="Detail" onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setRows((current) => [...current, { label: "", value: "" }])}>Add requirement</Button>
      <Textarea value={text} onChange={(event) => setText(event.target.value)} />
      <Button type="submit">Save requirements</Button>
    </form>
  );
}

export function TaskToggle({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  if (status === "completed" || status === "cancelled") return null;
  return <Button size="sm" variant="secondary" onClick={async () => { await setTaskStatusAction(id, "completed"); router.refresh(); }}>Done</Button>;
}

export function CloseoutList({ eventId, items }: { eventId: string; items: { key: string; label: string; done?: boolean }[] }) {
  const router = useRouter();
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(item.done)} onChange={async (event) => { await closeoutAction(eventId, item.key, event.target.checked); router.refresh(); }} />
            {item.label}
          </label>
        </li>
      ))}
    </ul>
  );
}

export function ReserveForm({ eventId, items }: { eventId: string; items: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid gap-2 md:grid-cols-4" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await reserveAction({
        eventId,
        itemId: String(form.get("itemId")),
        quantity: Number(form.get("quantity")),
        override: form.get("override") === "on",
        reason: String(form.get("reason") || ""),
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    }}>
      <Select name="itemId">{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <Input name="quantity" type="number" min={1} required placeholder="Qty" />
      <Input name="reason" placeholder="Override reason if needed" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="override" /> Override</label>
      <Button type="submit">Reserve</Button>
      {error ? <p className="text-sm text-destructive md:col-span-4">{error}</p> : null}
    </form>
  );
}

export function ReservationActions({ id, reserved }: { id: string; reserved: number }) {
  const router = useRouter();
  const [qty, setQty] = useState(reserved);
  const [damaged, setDamaged] = useState(0);
  const [lost, setLost] = useState(0);
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={async () => { await issueAction(id, qty); router.refresh(); }}>Issue {qty}</Button>
      <Input className="h-8 w-16" type="number" value={qty} onChange={(event) => setQty(Number(event.target.value))} />
      <Input className="h-8 w-20" type="number" value={damaged} onChange={(event) => setDamaged(Number(event.target.value))} placeholder="Damaged" />
      <Input className="h-8 w-16" type="number" value={lost} onChange={(event) => setLost(Number(event.target.value))} placeholder="Lost" />
      <Button size="sm" variant="outline" onClick={async () => { await returnAction(id, qty, damaged, lost); router.refresh(); }}>Reconcile</Button>
    </div>
  );
}

export function VendorStatus({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Select defaultValue="" onChange={async (event) => {
      if (!event.target.value) return;
      await vendorStatusAction(id, event.target.value as "confirmed");
      router.refresh();
    }}>
      <option value="">Update</option>
      <option value="quoted">Quoted</option>
      <option value="confirmed">Confirmed</option>
      <option value="completed">Completed</option>
      <option value="cancelled">Cancelled</option>
    </Select>
  );
}

void Field;
