"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { clientSchema, type ClientInput } from "@/domain/schemas";
import { createClientAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function ClientForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const form = useForm<ClientInput>({ resolver: zodResolver(clientSchema), defaultValues: { kind: "individual", preferredContact: "whatsapp", name: "", phone: "" } });
  return (
    <form className="grid max-w-xl gap-3" onSubmit={form.handleSubmit(async (values) => {
      const result = await createClientAction(values);
      if (!result.ok) setError(result.error);
      else router.push(`/clients/${result.data?.id}`);
    })}>
      <Field label="Type"><Select {...form.register("kind")}><option value="individual">Individual</option><option value="organization">Organisation</option></Select></Field>
      <Field label="Name"><Input {...form.register("name")} /></Field>
      <Field label="Organisation"><Input {...form.register("organizationName")} /></Field>
      <Field label="Phone"><Input {...form.register("phone")} /></Field>
      <Field label="Email"><Input {...form.register("email")} /></Field>
      <Field label="Preferred contact"><Select {...form.register("preferredContact")}><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option></Select></Field>
      <Field label="Notes"><Textarea {...form.register("notes")} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...form.register("forceNew")} /> Create anyway if the phone matches someone else</label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Save client</Button>
    </form>
  );
}
