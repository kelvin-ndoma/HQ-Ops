"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { formatKsh, priceQuotation, requiredDeposit, type DepositRule } from "@/domain/money";
import { quoteSchema } from "@/domain/schemas";
import { createQuoteAction, reviseQuoteAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

export type CatalogueService = {
  id: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  price: number;
  taxBehavior: string;
};

type LineValues = {
  serviceItemId?: string;
  description: string;
  quantity: number;
  unitPriceShillings: number;
  discountShillings?: number;
  taxRate?: number;
  unit?: string;
  internalNote?: string;
};

export function QuoteForm({
  enquiryId,
  quotationId,
  mode,
  spaces,
  services,
  selectedSpaceIds,
  lines,
  inclusions,
  arrangements,
  clientRequirements,
  notes,
  headerDiscountShillings,
  eventDate,
  startTime,
  endTime,
  guestCount,
  canOverridePrice,
  taxEnabled,
  defaultTaxRate,
  deposit,
}: {
  enquiryId: string;
  quotationId?: string;
  mode: "create" | "draft" | "revision";
  spaces: { id: string; name: string }[];
  services: CatalogueService[];
  selectedSpaceIds: string[];
  lines: LineValues[];
  inclusions: string[];
  arrangements: string;
  clientRequirements: string;
  notes: string;
  headerDiscountShillings: number;
  eventDate: string;
  startTime: string;
  endTime: string;
  guestCount?: number;
  canOverridePrice: boolean;
  taxEnabled: boolean;
  defaultTaxRate: number;
  deposit: DepositRule;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [catalogueFor, setCatalogueFor] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const form = useForm<z.input<typeof quoteSchema>>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      enquiryId,
      spaceIds: selectedSpaceIds,
      notes,
      headerDiscountShillings,
      inclusions,
      arrangements,
      clientRequirements,
      eventDate,
      startTime,
      endTime,
      guestCount,
      lines: lines.length ? lines : [{ description: "", quantity: guestCount || 1, unitPriceShillings: 0, discountShillings: 0, serviceItemId: "", unit: "item", internalNote: "" }],
    },
  });
  const rows = useFieldArray({ control: form.control, name: "lines" });
  const watched = useWatch({ control: form.control });
  const priced = useMemo(() => {
    const source = watched.lines || [];
    const usable = source.filter((line) => line?.description && line.description.trim().length >= 2 && Number(line.quantity) > 0);
    if (!usable.length) return null;
    try {
      return priceQuotation(
        usable.map((line) => ({
          description: line?.description || "",
          quantity: Number(line?.quantity) || 0,
          unitPriceCents: Math.round((Number(line?.unitPriceShillings) || 0) * 100),
          discountCents: Math.round((Number(line?.discountShillings) || 0) * 100),
          taxRate: Number(line?.taxRate) || (taxEnabled ? defaultTaxRate : 0),
        })),
        Math.round((Number(watched.headerDiscountShillings) || 0) * 100),
      );
    } catch {
      return null;
    }
  }, [watched.lines, watched.headerDiscountShillings, taxEnabled, defaultTaxRate]);
  const depositCents = priced ? requiredDeposit(priced.totalCents, deposit) : 0;
  const groups = services.reduce<Record<string, CatalogueService[]>>((all, service) => {
    const key = service.category || "Other";
    all[key] = all[key] || [];
    all[key].push(service);
    return all;
  }, {});
  const filtered = Object.entries(groups)
    .map(([category, items]) => [category, items.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()))] as const)
    .filter(([, items]) => items.length);

  function addService(index: number, service?: CatalogueService) {
    const guests = Number(form.getValues("guestCount")) || 1;
    if (!service) {
      form.setValue(`lines.${index}.serviceItemId`, "");
      form.setValue(`lines.${index}.description`, "");
      form.setValue(`lines.${index}.unit`, "item");
      form.setValue(`lines.${index}.unitPriceShillings`, 0);
      form.setValue(`lines.${index}.taxRate`, taxEnabled ? defaultTaxRate : 0);
      form.setValue(`lines.${index}.quantity`, 1);
    } else {
      const taxRate = service.taxBehavior === "exempt" || !taxEnabled ? 0 : defaultTaxRate;
      form.setValue(`lines.${index}.serviceItemId`, service.id);
      form.setValue(`lines.${index}.description`, service.name);
      form.setValue(`lines.${index}.unit`, service.unit || "item");
      form.setValue(`lines.${index}.unitPriceShillings`, service.price);
      form.setValue(`lines.${index}.taxRate`, taxRate);
      form.setValue(`lines.${index}.quantity`, service.unit === "guest" ? guests : 1);
    }
    setCatalogueFor(null);
    setQuery("");
  }

  return (
    <form className="space-y-8" onSubmit={form.handleSubmit(async (values) => {
      const payload = {
        ...values,
        inclusions: String(values.inclusions || []).length
          ? (Array.isArray(values.inclusions) ? values.inclusions : String(values.inclusions).split("\n")).map((item) => item.trim()).filter(Boolean)
          : [],
      };
      if (!Array.isArray(values.inclusions)) {
        payload.inclusions = String(form.getValues("inclusions") || "").split("\n").map((item) => item.trim()).filter(Boolean);
      }
      const result = quotationId
        ? await reviseQuoteAction({ ...payload, quotationId, reason })
        : await createQuoteAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(mode === "create" ? "Draft quotation created" : mode === "revision" ? "Revision saved" : "Draft updated");
      const createdId = (result.data as { id?: string } | undefined)?.id;
      router.push(`/quotations/${quotationId || createdId}`);
      router.refresh();
    })}>
      <input type="hidden" {...form.register("enquiryId")} />
      <section>
        <h2 className="text-sm font-medium">Event details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Event date"><Input type="date" {...form.register("eventDate")} /></Field>
          <Field label="Start"><Input type="time" {...form.register("startTime")} /></Field>
          <Field label="End"><Input type="time" {...form.register("endTime")} /></Field>
          <Field label="Guests"><Input type="number" {...form.register("guestCount", { valueAsNumber: true })} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {spaces.map((space) => (
            <label key={space.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" value={space.id} {...form.register("spaceIds")} /> {space.name}
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Services</h2>
          <Button type="button" variant="secondary" onClick={() => {
            rows.append({ description: "", quantity: 1, unitPriceShillings: 0, discountShillings: 0, serviceItemId: "", unit: "item", internalNote: "", taxRate: taxEnabled ? defaultTaxRate : 0 });
            setCatalogueFor(rows.fields.length);
          }}>Add item</Button>
        </div>
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-2 py-2 font-medium">Qty</th>
                <th className="px-2 py-2 font-medium">Unit</th>
                <th className="px-2 py-2 font-medium">Rate</th>
                <th className="px-2 py-2 font-medium">Total</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.fields.map((field, index) => {
                const line = watched.lines?.[index];
                const quantity = Number(line?.quantity) || 0;
                const rate = Number(line?.unitPriceShillings) || 0;
                const lineDiscount = Number(line?.discountShillings) || 0;
                const taxRate = Number(line?.taxRate) || 0;
                const net = Math.max(0, quantity * rate - lineDiscount);
                const total = net + net * taxRate;
                const lockedRate = Boolean(line?.serviceItemId) && !canOverridePrice;
                return (
                  <tr key={field.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setCatalogueFor(index)}>
                        {line?.description || "Choose an item"}
                      </button>
                      <input type="hidden" {...form.register(`lines.${index}.description`)} />
                      <input type="hidden" {...form.register(`lines.${index}.serviceItemId`)} />
                      <input type="hidden" {...form.register(`lines.${index}.taxRate`, { valueAsNumber: true })} />
                      <input className="mt-1 w-full bg-transparent text-xs text-muted-foreground outline-none" placeholder="Internal note" {...form.register(`lines.${index}.internalNote`)} />
                    </td>
                    <td className="px-2 py-2"><Input className="w-20" type="number" step="0.01" {...form.register(`lines.${index}.quantity`, { valueAsNumber: true })} /></td>
                    <td className="px-2 py-2"><Input className="w-24" {...form.register(`lines.${index}.unit`)} /></td>
                    <td className="px-2 py-2"><Input className="w-28" type="number" readOnly={lockedRate} {...form.register(`lines.${index}.unitPriceShillings`, { valueAsNumber: true })} /></td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatKsh(Math.round(total * 100))}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => index > 0 && rows.move(index, index - 1)}>Up</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => index < rows.fields.length - 1 && rows.move(index, index + 1)}>Down</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => rows.remove(index)}>Remove</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {catalogueFor != null ? (
          <div className="mt-3 rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the catalogue" />
              <Button type="button" variant="ghost" onClick={() => setCatalogueFor(null)}>Close</Button>
            </div>
            <div className="mt-3 max-h-72 space-y-3 overflow-auto">
              {filtered.map(([category, items]) => (
                <div key={category}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{category}</p>
                  <ul className="mt-1">
                    {items.map((service) => (
                      <li key={service.id}>
                        <button type="button" className="flex w-full justify-between py-1.5 text-left text-sm hover:text-primary" onClick={() => addService(catalogueFor, service)}>
                          <span>{service.name}</span>
                          <span className="text-muted-foreground">{formatKsh(Math.round(service.price * 100))} / {service.unit}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button type="button" className="text-sm underline" onClick={() => addService(catalogueFor)}>Custom item</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <Field label="Included in the proposal" hint="One inclusion on each line. These appear on the client proposal.">
            <Textarea defaultValue={inclusions.join("\n")} onChange={(event) => form.setValue("inclusions", event.target.value.split("\n"))} />
          </Field>
          <Field label="Special arrangements"><Textarea {...form.register("arrangements")} /></Field>
          <Field label="Client requirements"><Textarea {...form.register("clientRequirements")} /></Field>
          <Field label="Internal notes" hint="Staff only. These stay off the proposal."><Textarea {...form.register("notes")} /></Field>
          {mode === "revision" ? <Field label="Why this revision exists"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field> : null}
        </div>
        <aside className="h-fit rounded-md border border-border bg-card p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{priced ? formatKsh(priced.subtotalCents) : "—"}</span></div>
          <label className="mt-3 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Discount</span>
            <Input className="w-28 text-right" type="number" {...form.register("headerDiscountShillings", { valueAsNumber: true })} />
          </label>
          <div className="mt-3 flex justify-between"><span className="text-muted-foreground">Tax</span><span>{priced ? formatKsh(priced.taxCents) : "—"}</span></div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 font-medium"><span>Total investment</span><span>{priced ? formatKsh(priced.totalCents) : "—"}</span></div>
          <div className="mt-3 flex justify-between"><span className="text-muted-foreground">Required deposit</span><span>{priced ? formatKsh(depositCents) : "—"}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Remaining balance</span><span>{priced ? formatKsh(Math.max(0, priced.totalCents - depositCents)) : "—"}</span></div>
        </aside>
      </section>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {form.formState.errors.lines ? <p className="text-sm text-destructive">Each item needs a description, a quantity, and a rate.</p> : null}
      <Button type="submit">{mode === "create" ? "Create draft" : mode === "revision" ? "Save revision" : "Save draft"}</Button>
    </form>
  );
}
