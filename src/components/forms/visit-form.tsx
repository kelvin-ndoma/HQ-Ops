"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createVisitAction, updateVisitAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function VisitForm({ enquiries, staff, spaces, enquiryId }: { enquiries: { id: string; label: string }[]; staff: { id: string; name: string }[]; spaces: { id: string; name: string }[]; enquiryId?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await createVisitAction({
        enquiryId: String(form.get("enquiryId")),
        scheduledDate: String(form.get("date")),
        scheduledTime: String(form.get("time")),
        assignedToId: String(form.get("assignedToId")),
        spaceIds,
        notes: String(form.get("notes") || ""),
      });
      if (!result.ok) setError(result.error);
      else router.push(`/site-visits/${result.data?.id}`);
    }}>
      <Field label="Enquiry"><Select name="enquiryId" defaultValue={enquiryId}>{enquiries.map((enquiry) => <option key={enquiry.id} value={enquiry.id}>{enquiry.label}</option>)}</Select></Field>
      <Field label="Date"><Input name="date" type="date" required /></Field>
      <Field label="Time"><Input name="time" type="time" required /></Field>
      <Field label="Assigned staff"><Select name="assignedToId">{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></Field>
      <div className="flex flex-wrap gap-3">{spaces.map((space) => <label key={space.id} className="text-sm"><input type="checkbox" className="mr-2" checked={spaceIds.includes(space.id)} onChange={(event) => setSpaceIds((current) => event.target.checked ? [...current, space.id] : current.filter((id) => id !== space.id))} />{space.name}</label>)}</div>
      <Field label="Notes"><Textarea name="notes" /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Schedule</Button>
    </form>
  );
}

export function VisitOutcomeForm({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await updateVisitAction({
        id,
        status: String(form.get("status")),
        outcome: String(form.get("outcome") || "") || undefined,
        outcomeNotes: String(form.get("notes") || ""),
        scheduledDate: String(form.get("date") || ""),
        scheduledTime: String(form.get("time") || ""),
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    }}>
      <Field label="Status"><Select name="status"><option value="completed">Completed</option><option value="no_show">No-show</option><option value="rescheduled">Rescheduled</option><option value="cancelled">Cancelled</option></Select></Field>
      <Field label="Outcome"><Select name="outcome"><option value="">—</option><option value="interested">Interested</option><option value="maybe">Maybe</option><option value="not_suitable">Not suitable</option></Select></Field>
      <Field label="New date, if rescheduled"><Input name="date" type="date" /></Field>
      <Field label="New time"><Input name="time" type="time" /></Field>
      <Field label="Notes"><Textarea name="notes" /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Save outcome</Button>
    </form>
  );
}
