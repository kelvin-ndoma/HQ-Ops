"use client";

import { useState } from "react";
import { PUBLIC_BUDGET_BANDS, PUBLIC_CONSENT_TEXT } from "@/domain/public-enquiry";
import { submitPublicEnquiryAction } from "@/app/enquire/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

type Option = { id: string; name: string };

const control = "min-h-11 text-base";

export function EnquireForm({
  orgName,
  city,
  token,
  eventTypes,
  spaces,
  services,
}: {
  orgName: string;
  city: string;
  token: string;
  eventTypes: Option[];
  spaces: Option[];
  services: Option[];
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState<{ firstName: string; reference: string | null; eventDate: string } | null>(null);

  if (done?.reference) {
    return (
      <section className="rounded-md border border-border bg-card px-5 py-8" aria-live="polite">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Received</p>
        <h2 className="mt-2 font-display text-4xl text-primary">{done.firstName}, we have your enquiry.</h2>
        <p className="mt-4 text-base leading-relaxed">HQ has received <span className="font-medium">{done.reference}</span> for {done.eventDate}.</p>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">The team will review availability and the experience you described, then follow up. Sending this form does not reserve the venue or the date.</p>
      </section>
    );
  }

  if (done) {
    return (
      <section className="rounded-md border border-border bg-card px-5 py-8" aria-live="polite">
        <h2 className="font-display text-4xl text-primary">Thank you, {done.firstName}.</h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">If this was a genuine enquiry, the HQ team will follow up.</p>
      </section>
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setPending(true);
        const form = new FormData(event.currentTarget);
        const guests = Number(form.get("estimatedGuests"));
        const result = await submitPublicEnquiryAction({
          fullName: String(form.get("fullName") || ""),
          email: String(form.get("email") || ""),
          phone: String(form.get("phone") || ""),
          organization: String(form.get("organization") || ""),
          eventTypeId: String(form.get("eventTypeId") || ""),
          preferredDate: String(form.get("preferredDate") || ""),
          alternativeDate: String(form.get("alternativeDate") || ""),
          startTime: String(form.get("startTime") || ""),
          endTime: String(form.get("endTime") || ""),
          estimatedGuests: Number.isFinite(guests) ? guests : 0,
          spaceId: String(form.get("spaceId") || ""),
          budgetBand: String(form.get("budgetBand") || ""),
          serviceIds,
          experience: String(form.get("experience") || ""),
          consent,
          companyWebsite: String(form.get("companyWebsite") || ""),
          ref: token,
        });
        setPending(false);
        if (!result.ok || !result.data) {
          setError(result.ok ? "The enquiry could not be sent." : result.error);
          return;
        }
        setDone(result.data);
      }}
    >
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{city ? `Private events · ${city}` : "Private events"}</p>
        <h1 className="mt-2 font-display text-4xl text-primary sm:text-5xl">Enquire with {orgName}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">Tell us about the gathering you have in mind. A short note is enough. The team will come back to you.</p>
      </header>

      <fieldset className="space-y-4">
        <legend className="font-display text-2xl">Contact</legend>
        <Field label="Full name"><Input className={control} name="fullName" autoComplete="name" required /></Field>
        <Field label="Email"><Input className={control} name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Phone or WhatsApp"><Input className={control} name="phone" type="tel" autoComplete="tel" required /></Field>
        <Field label="Company or organisation" hint="Optional"><Input className={control} name="organization" autoComplete="organization" /></Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-2xl">Event</legend>
        <Field label="Event type">
          <Select className={control} name="eventTypeId" required defaultValue="">
            <option value="" disabled>Choose one</option>
            {eventTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Preferred date" hint="This is a request. HQ will confirm whether the date is free.">
          <Input className={control} name="preferredDate" type="date" required />
        </Field>
        <Field label="Alternative date" hint="Optional"><Input className={control} name="alternativeDate" type="date" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" hint="Optional"><Input className={control} name="startTime" type="time" /></Field>
          <Field label="End" hint="Optional"><Input className={control} name="endTime" type="time" /></Field>
        </div>
        <Field label="Estimated guests"><Input className={control} name="estimatedGuests" type="number" min={1} max={5000} inputMode="numeric" required /></Field>
        {spaces.length ? (
          <Field label="Space preference" hint="Optional">
            <Select className={control} name="spaceId" defaultValue="">
              <option value="">No preference yet</option>
              {spaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
        ) : <input type="hidden" name="spaceId" value="" />}
        <Field label="Estimated budget" hint="Optional. Your own range, not a quotation.">
          <Select className={control} name="budgetBand" defaultValue="">
            <option value="">Prefer not to say</option>
            {PUBLIC_BUDGET_BANDS.map((band) => <option key={band.id} value={band.id}>{band.label}</option>)}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-2xl">Requirements</legend>
        {services.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {services.map((item) => (
              <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-card px-3 text-base">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={serviceIds.includes(item.id)}
                  onChange={(event) => {
                    setServiceIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id));
                  }}
                />
                {item.name}
              </label>
            ))}
          </div>
        ) : null}
        <Field label="Tell us a little about the experience you're hoping to create.">
          <Textarea className="min-h-32 text-base" name="experience" maxLength={2000} />
        </Field>
      </fieldset>

      <label className="flex min-h-11 items-start gap-3 text-base">
        <input className="mt-1 size-4 accent-primary" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
        <span>{PUBLIC_CONSENT_TEXT}</span>
      </label>

      <div className="absolute -left-[9999px] h-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="companyWebsite">Company website</label>
        <input id="companyWebsite" name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </div>

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <Button className="h-12 w-full text-base" type="submit" disabled={pending || eventTypes.length === 0}>{pending ? "Sending…" : "Send enquiry"}</Button>
    </form>
  );
}
