"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { enquirySchema } from "@/domain/schemas";
import { createEnquiryAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

type Option = { id: string; name: string };

export function EnquiryForm({
  eventTypes,
  sources,
  spaces,
  owners,
}: {
  eventTypes: Option[];
  sources: Option[];
  spaces: Option[];
  owners: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const form = useForm<z.input<typeof enquirySchema>>({
    resolver: zodResolver(enquirySchema),
    defaultValues: {
      preferredContact: "whatsapp",
      priority: "normal",
      spaceIds: [],
      fullName: "",
      phone: "",
      eventTypeId: eventTypes[0]?.id || "",
      sourceId: sources[0]?.id || "",
    },
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={form.handleSubmit(async (values) => {
        setError("");
        const result = await createEnquiryAction(values);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Enquiry captured");
        router.push(`/enquiries/${result.data?.id}`);
      })}
    >
      <Field label="Full name"><Input {...form.register("fullName")} /></Field>
      <Field label="Company / organisation"><Input {...form.register("organization")} /></Field>
      <Field label="Phone"><Input {...form.register("phone")} /></Field>
      <Field label="Email"><Input {...form.register("email")} /></Field>
      <Field label="Preferred contact">
        <Select {...form.register("preferredContact")}>
          <option value="whatsapp">WhatsApp</option>
          <option value="phone">Phone</option>
          <option value="email">Email</option>
        </Select>
      </Field>
      <Field label="Source">
        <Select {...form.register("sourceId")}>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select>
      </Field>
      <Field label="Referral detail"><Input {...form.register("referralDetail")} /></Field>
      <Field label="Owner">
        <Select {...form.register("ownerId")}>
          <option value="">Unassigned</option>
          {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
        </Select>
      </Field>
      <Field label="Event type">
        <Select {...form.register("eventTypeId")}>{eventTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select>
      </Field>
      <Field label="Estimated guests"><Input type="number" {...form.register("estimatedGuests", { valueAsNumber: true })} /></Field>
      <Field label="Preferred date"><Input type="date" {...form.register("preferredDate")} /></Field>
      <Field label="Alternative date"><Input type="date" {...form.register("alternativeDate")} /></Field>
      <Field label="Start"><Input type="time" {...form.register("startTime")} /></Field>
      <Field label="End"><Input type="time" {...form.register("endTime")} /></Field>
      <Field label="Budget from (KSh)"><Input type="number" {...form.register("budgetMinShillings", { valueAsNumber: true })} /></Field>
      <Field label="Budget to (KSh)"><Input type="number" {...form.register("budgetMaxShillings", { valueAsNumber: true })} /></Field>
      <Field label="Estimated value (KSh)"><Input type="number" {...form.register("estimatedValueShillings", { valueAsNumber: true })} /></Field>
      <Field label="Priority">
        <Select {...form.register("priority")}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
      </Field>
      <Field label="Next action"><Input {...form.register("nextAction")} placeholder="Call to qualify the date" /></Field>
      <Field label="Next action date"><Input type="date" {...form.register("nextActionDate")} /></Field>
      <div className="md:col-span-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Spaces of interest</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {spaces.map((space) => (
            <label key={space.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" value={space.id} {...form.register("spaceIds")} />
              {space.name}
            </label>
          ))}
        </div>
      </div>
      <div className="md:col-span-2"><Field label="Requirements"><Textarea {...form.register("requirements")} /></Field></div>
      <div className="md:col-span-2"><Field label="Notes"><Textarea {...form.register("notes")} /></Field></div>
      <label className="md:col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("forceNewClient")} />
        This is a different person, even if the phone matches an existing client
      </label>
      {error ? <p className="md:col-span-2 text-sm text-destructive">{error}</p> : null}
      <div className="md:col-span-2"><Button type="submit" disabled={form.formState.isSubmitting}>Save enquiry</Button></div>
    </form>
  );
}
