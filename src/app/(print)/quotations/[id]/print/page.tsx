import { ProposalDocument } from "@/components/proposal/document";
import { requirePermission, requireUser } from "@/server/guard";
import { presentVersion } from "@/server/services/proposal";
import { getQuotation } from "@/server/services/commercial";

export default async function PrintQuote({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const user = await requireUser();
  requirePermission(user, "quotes.read");
  const { id } = await params;
  const { version } = await searchParams;
  const data = await getQuotation(id);
  const requested = Number(version);
  const versionNumber = Number.isFinite(requested) && requested > 0 ? requested : data.quote.currentVersion;
  const proposal = await presentVersion(id, versionNumber);
  return (
    <ProposalDocument proposal={proposal}>
      <p className="no-print mt-8 text-sm text-[#73695f]">Use the browser print dialog to save a PDF. This page is the client proposal.</p>
    </ProposalDocument>
  );
}
