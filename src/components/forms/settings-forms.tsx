"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserAction, saveAutomationAction, saveCatalogAction, saveCommercialAction, saveNotificationPrefsAction, saveOrganizationAction, updateUserAction } from "@/server/actions";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/permissions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function CommercialForm({ value }: { value: { quotationValidityDays: number; taxEnabled: boolean; defaultTaxRate: number; defaultTerms: string; holdDurationHours: number; staleEnquiryDays: number; mode: "percent" | "fixed" | "none"; percent: number | null; fixedShillings: number | null } }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const percent = String(form.get("percent") || "");
      const fixed = String(form.get("fixed") || "");
      const result = await saveCommercialAction({
        quotationValidityDays: Number(form.get("validity")),
        taxEnabled: form.get("taxEnabled") === "on",
        defaultTaxRate: Number(form.get("tax") || 0),
        defaultTerms: String(form.get("terms") || ""),
        holdDurationHours: Number(form.get("hold")),
        staleEnquiryDays: Number(form.get("stale")),
        depositMode: String(form.get("mode")) as "percent",
        depositPercent: percent === "" ? null : Number(percent),
        depositFixedShillings: fixed === "" ? null : Number(fixed),
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
      {(["name", "legalName", "address", "city", "phone", "email", "website"] as const).map((key) => <Field key={key} label={key}><Input name={key} defaultValue={value[key]} /></Field>)}
      <Button type="submit">Save organisation</Button>
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
      {Object.entries(value).map(([key, current]) => <Field key={key} label={key}><Input name={key} type="number" defaultValue={current} /></Field>)}
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

export function UserAdmin({ users }: { users: { id: string; name: string; email: string; role: Role; active: boolean }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-sm">
        {users.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-40">{person.name}</span>
            <span className="text-muted-foreground">{person.email}</span>
            <Select defaultValue={person.role} onChange={async (event) => { await updateUserAction(person.id, event.target.value as Role, person.active); router.refresh(); }}>
              {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </Select>
          </li>
        ))}
      </ul>
      <form className="grid gap-2 md:grid-cols-2" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const result = await createUserAction({
          name: String(form.get("name")),
          email: String(form.get("email")),
          phone: String(form.get("phone") || ""),
          role: String(form.get("role")),
          password: String(form.get("password")),
        });
        if (!result.ok) setError(result.error);
        else router.refresh();
      }}>
        <Input name="name" placeholder="Name" required />
        <Input name="email" type="email" placeholder="Email" required />
        <Input name="phone" placeholder="Phone" />
        <Select name="role">{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</Select>
        <Input name="password" type="password" placeholder="Temporary password" required />
        <Button type="submit">Add user</Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}
