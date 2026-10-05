"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { assignVendorAction, createVendorAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function VendorForm({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await createVendorAction({
        name: String(form.get("name")),
        contactName: String(form.get("contactName") || ""),
        phone: String(form.get("phone") || ""),
        email: String(form.get("email") || ""),
        categoryId: String(form.get("categoryId")),
        services: String(form.get("services") || ""),
        pricingNotes: String(form.get("pricingNotes") || ""),
        paymentTerms: String(form.get("paymentTerms") || ""),
        notes: String(form.get("notes") || ""),
        preferred: form.get("preferred") === "on",
      });
      if (!result.ok) setError(result.error);
      else router.push(`/vendors/${result.data?.id}`);
    }}>
      <Field label="Vendor"><Input name="name" required /></Field>
      <Field label="Contact"><Input name="contactName" /></Field>
      <Field label="Phone"><Input name="phone" /></Field>
      <Field label="Email"><Input name="email" /></Field>
      <Field label="Category"><Select name="categoryId">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
      <Field label="Services" hint="Comma separated"><Input name="services" /></Field>
      <Field label="Pricing notes"><Textarea name="pricingNotes" /></Field>
      <Field label="Payment terms"><Input name="paymentTerms" /></Field>
      <Field label="Internal notes"><Textarea name="notes" /></Field>
      <label className="text-sm"><input className="mr-2" name="preferred" type="checkbox" /> Preferred</label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Save vendor</Button>
    </form>
  );
}

export function AssignVendorForm({ eventId, vendorId }: { eventId: string; vendorId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await assignVendorAction({
        eventId,
        vendorId,
        service: String(form.get("service")),
        quotedShillings: Number(form.get("quoted") || 0),
        agreedShillings: Number(form.get("agreed") || 0),
        notes: String(form.get("notes") || ""),
      });
      if (!result.ok) setError(result.error);
      else router.push(`/events/${eventId}`);
    }}>
      <Field label="Service"><Input name="service" required /></Field>
      <Field label="Quoted (KSh)"><Input name="quoted" type="number" /></Field>
      <Field label="Agreed (KSh)"><Input name="agreed" type="number" /></Field>
      <Field label="Notes"><Textarea name="notes" /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Assign to event</Button>
    </form>
  );
}
