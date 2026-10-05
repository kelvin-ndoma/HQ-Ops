"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTaskAction, setTaskStatusAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function TaskForm({ owners, eventId }: { owners: { id: string; name: string }[]; eventId?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await createTaskAction({
        title: String(form.get("title")),
        description: String(form.get("description") || ""),
        ownerId: String(form.get("ownerId")),
        dueAt: String(form.get("dueAt") || ""),
        priority: String(form.get("priority")),
        relatedType: eventId ? "event" : "general",
        relatedId: eventId || "",
      });
      if (!result.ok) setError(result.error);
      else router.push("/tasks");
    }}>
      <Field label="Title"><Input name="title" required /></Field>
      <Field label="Owner"><Select name="ownerId">{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</Select></Field>
      <Field label="Due"><Input name="dueAt" type="datetime-local" /></Field>
      <Field label="Priority"><Select name="priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></Select></Field>
      <Field label="Description"><Textarea name="description" /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Create task</Button>
    </form>
  );
}

export function CompleteTask({ id }: { id: string }) {
  const router = useRouter();
  return <Button size="sm" variant="secondary" onClick={async () => { await setTaskStatusAction(id, "completed"); router.refresh(); }}>Complete</Button>;
}
