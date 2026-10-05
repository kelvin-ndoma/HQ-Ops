import { ProposalDocument } from "@/components/proposal/document";
import { ProposalResponse } from "@/components/proposal/respond";
import { readPublicProposal } from "@/server/services/proposal";

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await readPublicProposal(token);
  if (result.state === "invalid") {
    return <main className="mx-auto max-w-lg px-6 py-24 text-center"><h1 className="font-display text-3xl">This proposal is not available</h1><p className="mt-3 text-sm text-muted-foreground">The link may have been replaced or withdrawn.</p></main>;
  }
  if (result.state === "expired") {
    return <main className="mx-auto max-w-lg px-6 py-24 text-center"><h1 className="font-display text-3xl">This proposal has expired</h1><p className="mt-3 text-sm text-muted-foreground">Ask HQ for a current proposal.</p></main>;
  }
  if (result.state === "replaced") {
    return <main className="mx-auto max-w-lg px-6 py-24 text-center"><h1 className="font-display text-3xl">A newer proposal has been issued</h1><p className="mt-3 text-sm text-muted-foreground">This link no longer shows the current version.</p></main>;
  }
  return (
    <main className="min-h-full bg-[#f7f3ec] py-8">
      <ProposalDocument proposal={result.proposal}>
        {result.response === "accepted" ? <p className="no-print mt-10 text-sm">Accepted{result.acceptedByName ? ` by ${result.acceptedByName}` : ""}. This acceptance is not a payment.</p> : null}
        {result.response === "declined" ? <p className="no-print mt-10 text-sm">This proposal was declined.</p> : null}
        {result.response === "open" ? (
          <ProposalResponse
            token={token}
            summary={{
              organization: result.proposal.organization,
              date: result.proposal.date,
              total: result.proposal.totalLabel,
              deposit: result.proposal.showDeposit ? result.proposal.depositLabel : "None configured",
            }}
          />
        ) : null}
      </ProposalDocument>
    </main>
  );
}
