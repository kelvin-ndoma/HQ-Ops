"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelBookingAction, confirmBookingAction, createBookingAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function BookingForm({
  clients,
  spaces,
  owners,
  preset,
}: {
  clients: { id: string; name: string }[];
  spaces: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  preset?: { quotationId?: string; enquiryId?: string; clientId?: string; agreed?: number };
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await createBookingAction({
        clientId: String(form.get("clientId")),
        enquiryId: preset?.enquiryId || "",
        quotationId: preset?.quotationId || "",
        eventDate: String(form.get("eventDate")),
        endDate: String(form.get("endDate") || ""),
        startTime: String(form.get("startTime")),
        endTime: String(form.get("endTime")),
        spaceIds,
        guestCount: Number(form.get("guestCount")),
        agreedShillings: Number(form.get("agreed")),
        paymentDeadline: String(form.get("deadline") || ""),
        specialConditions: String(form.get("conditions") || ""),
        ownerId: String(form.get("ownerId") || ""),
        mode: String(form.get("mode")),
      });
      if (!result.ok) setError(result.error);
      else router.push(`/bookings/${result.data?.id}`);
    }}>
      <Field label="Client"><Select name="clientId" defaultValue={preset?.clientId}>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</Select></Field>
      <Field label="Owner"><Select name="ownerId">{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</Select></Field>
      <Field label="Date"><Input name="eventDate" type="date" required /></Field>
      <Field label="End date if different"><Input name="endDate" type="date" /></Field>
      <Field label="Start"><Input name="startTime" type="time" required defaultValue="16:00" /></Field>
      <Field label="End"><Input name="endTime" type="time" required defaultValue="22:00" /></Field>
      <Field label="Guests"><Input name="guestCount" type="number" required /></Field>
      <Field label="Agreed amount (KSh)"><Input name="agreed" type="number" required defaultValue={preset?.agreed} /></Field>
      <Field label="Payment deadline"><Input name="deadline" type="date" /></Field>
      <Field label="How to hold the date"><Select name="mode" defaultValue="commit"><option value="hold">Tentative hold only</option><option value="commit">Commit, awaiting deposit if required</option></Select></Field>
      <div className="md:col-span-2 flex flex-wrap gap-3">{spaces.map((space) => <label key={space.id} className="text-sm"><input className="mr-2" type="checkbox" checked={spaceIds.includes(space.id)} onChange={(event) => setSpaceIds((current) => event.target.checked ? [...current, space.id] : current.filter((id) => id !== space.id))} />{space.name}</label>)}</div>
      <div className="md:col-span-2"><Field label="Special conditions"><Textarea name="conditions" /></Field></div>
      {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
      <Button type="submit">Save booking</Button>
    </form>
  );
}

export function BookingDecisions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  return (
    <div className="space-y-3">
      {status === "tentative" || status === "awaiting_deposit" ? (
        <form className="space-y-2" onSubmit={async (event) => {
          event.preventDefault();
          const result = await confirmBookingAction({ id, overrideDeposit: override, reason });
          if (!result.ok) setError(result.error);
          else router.refresh();
        }}>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} /> Confirm before the deposit, with a reason</label>
          {override ? <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this being confirmed early?" /> : null}
          <Button type="submit">Confirm booking</Button>
        </form>
      ) : null}
      {status !== "cancelled" && status !== "completed" ? (
        <form className="space-y-2" onSubmit={async (event) => {
          event.preventDefault();
          const result = await cancelBookingAction({ id, reason });
          if (!result.ok) setError(result.error);
          else router.refresh();
        }}>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Cancellation reason" />
          <Button type="submit" variant="destructive">Cancel booking</Button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
