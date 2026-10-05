"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useState } from "react";
import { toast } from "sonner";
import { formatKsh } from "@/domain/money";
import { formatWhen } from "@/domain/operations";
import { ENQUIRY_EXITS, ENQUIRY_STAGES, ENQUIRY_STATUS_LABELS, type EnquiryStatus } from "@/domain/states";
import { transitionEnquiryAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

export type PipelineCard = {
  id: string;
  reference: string;
  name: string;
  company: string;
  eventType: string;
  date: string | null;
  guests: number | null;
  valueCents: number;
  owner: string;
  nextAction: string;
  nextActionAt: string | null;
  stage: EnquiryStatus;
};

function Card({ card }: { card: PipelineCard }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab rounded-md border border-border bg-card p-3 text-sm shadow-sm">
      <a href={`/enquiries/${card.id}`} className="font-medium" onPointerDown={(event) => event.stopPropagation()}>{card.name}</a>
      <p className="text-xs text-muted-foreground">{card.company || card.reference}</p>
      <p className="mt-2">{card.eventType} · {formatWhen(card.date)} · {card.guests || "—"} guests</p>
      <p className="mt-1">{formatKsh(card.valueCents)}</p>
      <p className="mt-2 text-xs text-muted-foreground">{card.owner || "No owner"} · {card.nextAction || "No next action"} {card.nextActionAt ? `· ${formatWhen(card.nextActionAt)}` : ""}</p>
    </article>
  );
}

function Column({ stage, cards }: { stage: EnquiryStatus; cards: PipelineCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={`w-[280px] shrink-0 rounded-md border p-2 ${isOver ? "border-primary bg-accent/40" : "border-border bg-muted/40"}`}>
      <div className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-wide text-muted-foreground">
        <span>{ENQUIRY_STATUS_LABELS[stage]}</span>
        <span>{cards.length}</span>
      </div>
      <div className="space-y-2">
        {cards.map((card) => <Card key={card.id} card={card} />)}
      </div>
    </div>
  );
}

export function PipelineBoard({ initial, lostReasons }: { initial: PipelineCard[]; lostReasons: { id: string; name: string }[] }) {
  const [cards, setCards] = useState(initial);
  const [pendingLost, setPendingLost] = useState<string | null>(null);
  const [reason, setReason] = useState(lostReasons[0]?.id || "");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const stages: EnquiryStatus[] = [...ENQUIRY_STAGES, ...ENQUIRY_EXITS];

  async function move(id: string, stage: EnquiryStatus, lostReasonId?: string) {
    const previous = cards;
    setCards((current) => current.map((card) => card.id === id ? { ...card, stage } : card));
    const result = await transitionEnquiryAction({ id, stage, lostReasonId: lostReasonId || "" });
    if (!result.ok) {
      setCards(previous);
      toast.error(result.error);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const stage = event.over?.id as EnquiryStatus | undefined;
    const id = String(event.active.id);
    if (!stage || !stages.includes(stage)) return;
    if (stage === "lost") {
      setPendingLost(id);
      return;
    }
    void move(id, stage);
  }

  return (
    <div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => <Column key={stage} stage={stage} cards={cards.filter((card) => card.stage === stage)} />)}
        </div>
      </DndContext>
      <div className="space-y-2 md:hidden">
        {cards.map((card) => (
          <label key={card.id} className="block text-sm">
            {card.name}
            <Select className="mt-1" value={card.stage} onChange={(event) => {
              const stage = event.target.value as EnquiryStatus;
              if (stage === "lost") setPendingLost(card.id);
              else void move(card.id, stage);
            }}>
              {stages.map((stage) => <option key={stage} value={stage}>{ENQUIRY_STATUS_LABELS[stage]}</option>)}
            </Select>
          </label>
        ))}
      </div>
      {pendingLost ? (
        <form className="mt-4 max-w-sm space-y-2 rounded-md border border-border bg-card p-3" onSubmit={async (event) => {
          event.preventDefault();
          await move(pendingLost, "lost", reason);
          setPendingLost(null);
        }}>
          <p className="text-sm font-medium">Why was this lost?</p>
          <Select value={reason} onChange={(event) => setReason(event.target.value)}>
            {lostReasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Button type="submit">Mark lost</Button>
        </form>
      ) : null}
    </div>
  );
}
