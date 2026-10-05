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
    <div className="flex h-[calc(100dvh-7rem)] min-h-[32rem] flex-col">
      <PipelineBoard
        initial={board.cards}
        lostReasons={reasons.map((reason) => ({ id: String(reason._id), name: reason.name }))}
        owners={board.owners}
        eventTypes={board.eventTypes}
        sources={board.sources}
        visitsThisWeek={board.visitsThisWeek}
        quotesWaiting={board.quotesWaiting}
      />
    </div>
  );
}
