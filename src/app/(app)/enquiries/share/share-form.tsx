"use client";

import { useState } from "react";
import { createEnquiryLinkAction } from "@/app/(app)/enquiries/share/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

function pathFor(token: string) {
  return token ? `/enquire?ref=${token}` : "/enquire";
}

function absolute(path: string) {
  return `${window.location.origin}${path}`;
}

export function ShareEnquiryForm({
  sources,
  staff,
  links,
}: {
  sources: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  links: { id: string; token: string; source: string; campaign: string; staff: string }[];
}) {
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [generated, setGenerated] = useState("");

  async function copy(path: string) {
    const value = absolute(path);
    await navigator.clipboard.writeText(value);
    setCopied(value);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="font-medium">Standard link</h2>
        <p className="mt-1 text-sm text-muted-foreground">Enquiries from this link are attributed to Website — Public Form.</p>
        <Button className="mt-3" type="button" variant="secondary" onClick={() => copy(pathFor(""))}>Copy standard link</Button>
      </section>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        const result = await createEnquiryLinkAction({
          sourceId: String(form.get("sourceId") || ""),
          campaign: String(form.get("campaign") || ""),
          staffId: String(form.get("staffId") || ""),
        });
        if (!result.ok || !result.data) {
          setError(result.ok ? "The link could not be created." : result.error);
          return;
        }
        const path = pathFor(result.data.token);
        setGenerated(absolute(path));
        await copy(path);
      }}>
        <Field label="Source">
          <Select name="sourceId" defaultValue={sources[0]?.id || ""} required>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </Select>
        </Field>
        <Field label="Campaign" hint="Optional"><Input name="campaign" maxLength={80} placeholder="Spring dinners" /></Field>
        <Field label="Referring staff" hint="Optional. Their name is stored on the link, not in the URL.">
          <Select name="staffId" defaultValue="">
            <option value="">No staff referral</option>
            {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-end"><Button type="submit">Generate attributed link</Button></div>
        {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
        {generated ? <p className="break-all text-sm md:col-span-2">Copied · {generated}</p> : null}
        {copied && copied !== generated ? <p className="text-sm text-muted-foreground md:col-span-2">Copied · {copied}</p> : null}
      </form>
      <section>
        <h2 className="mb-2 font-medium">Generated links</h2>
        <ul className="space-y-2 text-sm">
          {links.map((link) => (
            <li key={link.id} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="font-medium">{link.source}{link.campaign ? ` · ${link.campaign}` : ""}{link.staff ? ` · ${link.staff}` : ""}</p>
              <button className="mt-1 break-all text-left text-muted-foreground underline" type="button" onClick={() => copy(pathFor(link.token))}>{pathFor(link.token)}</button>
            </li>
          ))}
          {links.length === 0 ? <li className="text-muted-foreground">No attributed links yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
