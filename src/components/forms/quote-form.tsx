"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { quoteSchema } from "@/domain/schemas";
import { createQuoteAction, reviseQuoteAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function QuoteForm({
  enquiryId,
  spaces,
  services,
  quotationId,
}: {
  enquiryId: string;
  spaces: { id: string; name: string }[];
  services: { id: string; name: string; price: number }[];
  quotationId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const form = useForm<z.input<typeof quoteSchema>>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      enquiryId,
      spaceIds: [],
      lines: [{ description: services[0]?.name || "Venue hire", quantity: 1, unitPriceShillings: services[0]?.price || 0, discountShillings: 0, serviceItemId: services[0]?.id || "" }],
    },
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(async (values) => {
      const result = quotationId
        ? await reviseQuoteAction({ ...values, quotationId, reason })
        : await createQuoteAction(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(quotationId ? "New version saved" : "Draft quotation created");
      const createdId = (result.data as { id?: string } | undefined)?.id;
      router.push(quotationId ? `/quotations/${quotationId}` : `/quotations/${createdId}`);
      router.refresh();
    })}>
      <input type="hidden" {...form.register("enquiryId")} />
      <div className="flex flex-wrap gap-3">
        {spaces.map((space) => (
          <label key={space.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" value={space.id} {...form.register("spaceIds")} /> {space.name}
          </label>
        ))}
      </div>
      {lines.fields.map((field, index) => (
        <div key={field.id} className="grid gap-2 rounded-md border border-border bg-card p-3 md:grid-cols-5">
          <Field label="Catalogue">
            <Select {...form.register(`lines.${index}.serviceItemId`)} onChange={(event) => {
              const service = services.find((item) => item.id === event.target.value);
              form.setValue(`lines.${index}.serviceItemId`, event.target.value);
              if (service) {
                form.setValue(`lines.${index}.description`, service.name);
                form.setValue(`lines.${index}.unitPriceShillings`, service.price);
              }
            }}>
              <option value="">Custom</option>
              {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </Select>
          </Field>
          <Field label="Description"><Input {...form.register(`lines.${index}.description`)} /></Field>
          <Field label="Qty"><Input type="number" step="0.01" {...form.register(`lines.${index}.quantity`, { valueAsNumber: true })} /></Field>
          <Field label="Unit price (KSh)"><Input type="number" {...form.register(`lines.${index}.unitPriceShillings`, { valueAsNumber: true })} /></Field>
          <Field label="Discount (KSh)"><Input type="number" {...form.register(`lines.${index}.discountShillings`, { valueAsNumber: true })} /></Field>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => lines.append({ description: "", quantity: 1, unitPriceShillings: 0, discountShillings: 0, serviceItemId: "" })}>Add line</Button>
      <Field label="Header discount (KSh)"><Input type="number" {...form.register("headerDiscountShillings", { valueAsNumber: true })} /></Field>
      <Field label="Notes"><Textarea {...form.register("notes")} /></Field>
      {quotationId ? <Field label="Why this revision exists"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">{quotationId ? "Save new version" : "Create draft"}</Button>
    </form>
  );
}
