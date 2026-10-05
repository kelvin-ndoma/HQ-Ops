"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAutomationAction, saveCatalogAction, saveCommercialAction, saveNotificationPrefsAction, saveOrganizationAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

function blankNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function CommercialForm({ value }: { value: { quotationValidityDays: number; taxEnabled: boolean; defaultTaxRate: number; defaultTerms: string; holdDurationHours: number; staleEnquiryDays: number; mode: "percent" | "fixed" | "none"; percent: number | null; fixedShillings: number | null; approvals: { maxDiscountPercent: number | null; inventoryWriteOffCents: number | null; procurementCents: number | null; minimumUnitPriceCents: number | null; refundCents: number | null } } }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const shillings = (cents: number | null) => (cents == null ? "" : cents / 100);
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await saveCommercialAction({
        quotationValidityDays: Number(form.get("validity")),
        taxEnabled: form.get("taxEnabled") === "on",
        defaultTaxRate: Number(form.get("tax") || 0),
        defaultTerms: String(form.get("terms") || ""),
        holdDurationHours: Number(form.get("hold")),
        staleEnquiryDays: Number(form.get("stale")),
        depositMode: String(form.get("mode")) as "percent",
        depositPercent: blankNumber(form.get("percent")),
        depositFixedShillings: blankNumber(form.get("fixed")),
        maxDiscountPercent: blankNumber(form.get("maxDiscount")),
        inventoryWriteOffShillings: blankNumber(form.get("writeOff")),
        procurementShillings: blankNumber(form.get("procurement")),
        minimumUnitPriceShillings: blankNumber(form.get("minimumPrice")),
        refundShillings: blankNumber(form.get("refund")),
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    }}>
      <Field label="Deposit rule"><Select name="mode" defaultValue={value.mode}><option value="none">No deposit until configured</option><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></Select></Field>
      <Field label="Percent" hint="Leave blank to avoid assuming a rate"><Input name="percent" type="number" defaultValue={value.percent ?? ""} /></Field>
      <Field label="Fixed amount (KSh)"><Input name="fixed" type="number" defaultValue={value.fixedShillings ?? ""} /></Field>
      <Field label="Quote validity (days)"><Input name="validity" type="number" defaultValue={value.quotationValidityDays} /></Field>
      <Field label="Hold duration (hours)"><Input name="hold" type="number" defaultValue={value.holdDurationHours} /></Field>
      <Field label="Stale enquiry (days)"><Input name="stale" type="number" defaultValue={value.staleEnquiryDays} /></Field>
      <label className="text-sm"><input className="mr-2" type="checkbox" name="taxEnabled" defaultChecked={value.taxEnabled} /> Charge tax</label>
      <Field label="Tax rate" hint="0.16 means 16 percent"><Input name="tax" type="number" step="0.01" defaultValue={value.defaultTaxRate} /></Field>
      <div className="md:col-span-2"><Field label="Quotation terms"><Textarea name="terms" defaultValue={value.defaultTerms} /></Field></div>
      <Field label="Discount approval above (%)" hint="Blank turns the gate off"><Input name="maxDiscount" type="number" step="0.1" defaultValue={value.approvals.maxDiscountPercent ?? ""} /></Field>
      <Field label="Minimum unit price (KSh)" hint="Blank turns the gate off"><Input name="minimumPrice" type="number" defaultValue={shillings(value.approvals.minimumUnitPriceCents)} /></Field>
      <Field label="Refund approval above (KSh)" hint="Blank turns the gate off"><Input name="refund" type="number" defaultValue={shillings(value.approvals.refundCents)} /></Field>
      <Field label="Write-off approval above (KSh)" hint="Blank turns the gate off"><Input name="writeOff" type="number" defaultValue={shillings(value.approvals.inventoryWriteOffCents)} /></Field>
      <Field label="Procurement approval above (KSh)" hint="Blank turns the gate off"><Input name="procurement" type="number" defaultValue={shillings(value.approvals.procurementCents)} /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Save commercial rules</Button>
    </form>
  );
}

export function OrganizationForm({ value }: { value: { name: string; legalName: string; address: string; city: string; phone: string; email: string; website: string } }) {
  const router = useRouter();
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await saveOrganizationAction({
        name: String(form.get("name")),
        legalName: String(form.get("legalName")),
        address: String(form.get("address")),
        city: String(form.get("city")),
        phone: String(form.get("phone")),
        email: String(form.get("email")),
        website: String(form.get("website")),
      });
      router.refresh();
    }}>
      <Field label="Trading name"><Input name="name" defaultValue={value.name} /></Field>
      <Field label="Legal name"><Input name="legalName" defaultValue={value.legalName} /></Field>
      <Field label="Street address"><Input name="address" defaultValue={value.address} /></Field>
      <Field label="City"><Input name="city" defaultValue={value.city} /></Field>
      <Field label="Phone"><Input name="phone" defaultValue={value.phone} /></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={value.email} /></Field>
      <Field label="Website"><Input name="website" defaultValue={value.website} /></Field>
      <div className="md:col-span-2"><Button type="submit">Save organisation</Button></div>
    </form>
  );
}

export function AutomationForm({ value }: { value: { newEnquiryFollowUpHours: number; visitReminderHours: number; postVisitFollowUpHours: number; quoteFollowUpDays: number; quoteInactivityDays: number; depositFollowUpDays: number } }) {
  const router = useRouter();
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await saveAutomationAction({
        newEnquiryFollowUpHours: Number(form.get("newEnquiryFollowUpHours")),
        visitReminderHours: Number(form.get("visitReminderHours")),
        postVisitFollowUpHours: Number(form.get("postVisitFollowUpHours")),
        quoteFollowUpDays: Number(form.get("quoteFollowUpDays")),
        quoteInactivityDays: Number(form.get("quoteInactivityDays")),
        depositFollowUpDays: Number(form.get("depositFollowUpDays")),
      });
      router.refresh();
    }}>
      <Field label="First contact (hours)"><Input name="newEnquiryFollowUpHours" type="number" defaultValue={value.newEnquiryFollowUpHours} /></Field>
      <Field label="Visit reminder (hours)"><Input name="visitReminderHours" type="number" defaultValue={value.visitReminderHours} /></Field>
      <Field label="After a visit (hours)"><Input name="postVisitFollowUpHours" type="number" defaultValue={value.postVisitFollowUpHours} /></Field>
      <Field label="Quote follow-up (days)"><Input name="quoteFollowUpDays" type="number" defaultValue={value.quoteFollowUpDays} /></Field>
      <Field label="Quiet quote (days)"><Input name="quoteInactivityDays" type="number" defaultValue={value.quoteInactivityDays} /></Field>
      <Field label="Deposit follow-up (days)"><Input name="depositFollowUpDays" type="number" defaultValue={value.depositFollowUpDays} /></Field>
      <p className="md:col-span-2 text-xs text-muted-foreground">Preparation task offsets stay on the saved automation record and can be edited by an administrator in the database setting. The timings above are the follow-up clocks.</p>
      <Button type="submit">Save timings</Button>
    </form>
  );
}

export function NotificationPrefs({ value }: { value: { inApp: boolean; emailEnabled: boolean; whatsappEnabled: boolean } }) {
  const router = useRouter();
  return (
    <form className="space-y-2 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await saveNotificationPrefsAction({
        inApp: form.get("inApp") === "on",
        emailEnabled: form.get("emailEnabled") === "on",
        whatsappEnabled: form.get("whatsappEnabled") === "on",
      });
      router.refresh();
    }}>
      <label className="block"><input className="mr-2" type="checkbox" name="inApp" defaultChecked={value.inApp} /> In-app</label>
      <label className="block"><input className="mr-2" type="checkbox" name="emailEnabled" defaultChecked={value.emailEnabled} /> Email adapter enabled (no provider is connected)</label>
      <label className="block"><input className="mr-2" type="checkbox" name="whatsappEnabled" defaultChecked={value.whatsappEnabled} /> WhatsApp adapter enabled (no provider is connected)</label>
      <Button type="submit">Save notifications</Button>
    </form>
  );
}

export function CatalogEditor({ kind, rows }: { kind: "event-type" | "source" | "lost-reason" | "inventory-category" | "vendor-category" | "payment-method" | "space" | "service"; rows: { id: string; name: string; extra?: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  return (
    <div>
      <ul className="mb-2 text-sm">{rows.map((row) => <li key={row.id}>{row.name}{row.extra ? ` · ${row.extra}` : ""}</li>)}</ul>
      <form className="flex gap-2" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await saveCatalogAction(kind, {
          name: String(form.get("name")),
          capacity: form.get("capacity") ? Number(form.get("capacity")) : undefined,
          unitPriceShillings: form.get("price") ? Number(form.get("price")) : undefined,
        });
        setName("");
        router.refresh();
      }}>
        <Input name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Add" />
        {kind === "space" ? <Input name="capacity" type="number" placeholder="Capacity" /> : null}
        {kind === "service" ? <Input name="price" type="number" placeholder="Price KSh" /> : null}
        <Button type="submit" variant="secondary">Add</Button>
      </form>
    </div>
  );
}
