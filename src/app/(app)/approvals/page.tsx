import { formatWhen } from "@/domain/operations";
import { ApprovalReview } from "@/components/forms/approval-review";
import { PageHeader } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/server/guard";
import { canReviewApproval } from "@/server/services/approvals";
import { listApprovals } from "@/server/services/approvals";
import type { ApprovalAction } from "@/domain/approvals";

export default async function ApprovalsPage() {
  const user = await requireUser();
  const rows = await listApprovals(user);
  return (
    <div>
      <PageHeader eyebrow="System" title="Approvals" description="A request records who asked, what would change, and who decided. Approving a refund or a write-off is the moment the record is created. Nothing is rewritten afterwards." />
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={String(row._id)} className="rounded-md border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{String(row.actionType).replaceAll("_", " ")} · {row.entityType}</span>
              <StatusPill value={row.status} />
            </div>
            <p className="mt-1 text-muted-foreground">{row.reason} · {formatWhen(row.requestedAt || row.createdAt, "Africa/Nairobi", true)}</p>
            {row.status === "pending" && canReviewApproval(user.role, row.actionType as ApprovalAction) ? <ApprovalReview id={String(row._id)} /> : null}
            {row.reviewerNotes ? <p className="mt-2">{row.reviewerNotes}</p> : null}
          </li>
        ))}
        {rows.length === 0 ? <li className="text-sm text-muted-foreground">No approval requests.</li> : null}
      </ul>
    </div>
  );
}
