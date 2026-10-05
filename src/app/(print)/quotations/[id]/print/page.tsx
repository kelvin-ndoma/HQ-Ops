import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { getOrganization } from "@/server/settings";
import { getQuotation } from "@/server/services/commercial";
import { requireUser } from "@/server/guard";
import { Space } from "@/server/models";

export default async function PrintQuote({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return null;
  const { id } = await params;
  const [data, org] = await Promise.all([getQuotation(id), getOrganization()]);
  const spaces = await Space.find({ _id: { $in: data.quote.spaceIds || [] } }).lean();
  const version = data.versions.find((item) => item.version === data.quote.currentVersion);
  return (
    <article className="mx-auto max-w-3xl bg-white px-8 py-10 text-stone-900">
      <header className="flex items-end justify-between border-b border-stone-300 pb-4">
        <div>
          <p className="font-display text-4xl">{org.name}</p>
          <p className="text-sm">{org.address} {org.city}</p>
          <p className="text-sm">{org.phone} {org.email}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">{data.quote.reference} · V{version?.version}</p>
          <p>{formatWhen(data.quote.createdAt)}</p>
          <p>{data.quote.validUntil ? `Valid until ${formatWhen(data.quote.validUntil)}` : "Draft"}</p>
        </div>
      </header>
      <p className="mt-6 text-sm">Prepared for {data.client?.name}{data.client?.organizationName ? `, ${data.client.organizationName}` : ""}</p>
      <p className="text-sm">{spaces.map((space) => space.name).join(", ")}</p>
      <table className="mt-6 w-full text-sm">
        <thead><tr className="border-b text-left"><th className="py-2">Description</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>
          {(version?.lines || []).map((line: { description: string; quantity: number; totalCents: number }, index: number) => (
            <tr key={index} className="border-b border-stone-200"><td className="py-2">{line.description}</td><td>{line.quantity}</td><td>{formatKsh(line.totalCents)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-right font-display text-2xl">{formatKsh(version?.totalCents || 0)}</p>
      <p className="mt-8 text-sm leading-6">{data.quote.terms}</p>
      <p className="no-print mt-6 text-sm text-stone-500">Use the browser print dialog to save a PDF. This page is the quotation, not a separate template.</p>
    </article>
  );
}
