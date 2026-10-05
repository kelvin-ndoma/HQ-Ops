import { can } from "@/domain/permissions";
import { PipelineBoard } from "@/components/pipeline/board";
import { requirePermission, requireUser } from "@/server/guard";
import { LostReason } from "@/server/models";
import { listPipeline } from "@/server/services/crm";

export default async function PipelinePage() {
  const user = await requireUser();
  requirePermission(user, "enquiries.read");
  const [board, reasons] = await Promise.all([
    listPipeline(),
    LostReason.find({ active: true }).sort({ name: 1 }).lean(),
  ]);
  return (
    <PipelineBoard
      initial={board.cards}
      lostReasons={reasons.map((reason) => ({ id: String(reason._id), name: reason.name }))}
      owners={board.owners}
      eventTypes={board.eventTypes}
      sources={board.sources}
      visitsThisWeek={board.visitsThisWeek}
      quotesWaiting={board.quotesWaiting}
      access={{
        move: can(user.role, "enquiries.transition"),
        visit: can(user.role, "visits.write"),
        quoteRead: can(user.role, "quotes.read"),
        quoteWrite: can(user.role, "quotes.write"),
        task: can(user.role, "tasks.write"),
      }}
    />
  );
}
