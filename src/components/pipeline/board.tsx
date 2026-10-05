"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatKsh } from "@/domain/money";
import { ENQUIRY_EXITS, ENQUIRY_STAGES, ENQUIRY_STATUS_LABELS, type EnquiryStatus } from "@/domain/states";
import { transitionEnquiryAction } from "@/server/actions";

export type PipelineCard = {
  id: string;
  reference: string;
  title: string;
  eventType: string;
  source: string;
  date: string | null;
  month: string;
  guests: number | null;
  valueCents: number;
  owner: string;
  ownerId: string;
  nextAction: string;
  nextActionAt: string | null;
  stage: EnquiryStatus;
  priority: string;
};

type FollowUp = { label: string; tone: "overdue" | "today" | "missing" | "plain" };

function nairobiDay(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function shortDate(value: string | null) {
  if (!value) return "Date not set";
  return new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }).format(new Date(value));
}

function compactKsh(cents: number) {
  const shillings = cents / 100;
  if (shillings >= 1_000_000) {
    const millions = shillings / 1_000_000;
    const digits = millions >= 10 ? 0 : 1;
    return `KSh ${millions.toFixed(digits).replace(/\.0$/, "")}M`;
  }
  return formatKsh(cents);
}

function followUp(card: PipelineCard, today: string): FollowUp {
  if (!card.nextAction && !card.nextActionAt) return { label: "No next action", tone: "missing" };
  if (!card.nextActionAt) return { label: card.nextAction, tone: "plain" };
  const due = nairobiDay(new Date(card.nextActionAt));
  if (due < today) return { label: "Follow-up overdue", tone: "overdue" };
  if (due === today) return { label: "Follow up today", tone: "today" };
  return { label: `${card.nextAction || "Follow up"} · ${shortDate(card.nextActionAt)}`, tone: "plain" };
}

function CardBody({ card, stages, onMove, drag }: { card: PipelineCard; stages: EnquiryStatus[]; onMove: (id: string, stage: EnquiryStatus) => void; drag?: React.HTMLAttributes<HTMLButtonElement> }) {
  const today = nairobiDay(new Date());
  const follow = followUp(card, today);
  const important = card.priority === "high" || card.priority === "urgent";
  const accent = follow.tone === "overdue" ? "border-l-2 border-l-destructive" : important ? "border-l-2 border-l-primary" : "";
  return (
    <article className={`border border-border bg-card px-3 py-2.5 text-sm ${accent}`}>
      <div className="flex items-start justify-between gap-2">
        <a href={`/enquiries/${card.id}`} className="font-medium leading-snug hover:underline" onPointerDown={(event) => event.stopPropagation()}>{card.title}</a>
        {drag ? <button type="button" className="cursor-grab px-1 text-muted-foreground" aria-label={`Move ${card.title}`} {...drag}>Move</button> : null}
      </div>
      <p className="text-muted-foreground">{card.eventType}</p>
      <p className="mt-2 text-[13px]">{shortDate(card.date)}{card.guests ? ` · ${card.guests} guests` : ""}</p>
      <p className="mt-1 font-medium">{formatKsh(card.valueCents)}</p>
      <p className="mt-2 text-xs text-muted-foreground">{card.owner || "No owner"}</p>
      <p className={`text-xs ${follow.tone === "overdue" ? "text-destructive" : follow.tone === "today" ? "text-warning" : follow.tone === "missing" ? "text-warning" : "text-muted-foreground"}`}>{follow.label}</p>
      {important ? <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{card.priority === "urgent" ? "Urgent" : "High priority"}</p> : null}
      <label className="mt-2 block text-[11px] text-muted-foreground">
        Stage
        <select
          className="mt-1 h-8 w-full border border-border bg-background px-2 text-xs"
          value={card.stage}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onMove(card.id, event.target.value as EnquiryStatus)}
        >
          {stages.map((stage) => <option key={stage} value={stage}>{ENQUIRY_STATUS_LABELS[stage]}</option>)}
        </select>
      </label>
    </article>
  );
}

function CardView({ card, stages, onMove }: { card: PipelineCard; stages: EnquiryStatus[]; onMove: (id: string, stage: EnquiryStatus) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-70" : undefined}>
      <CardBody card={card} stages={stages} onMove={onMove} drag={{ ...listeners, ...attributes }} />
    </div>
  );
}

function Column({ stage, cards, stages, onMove }: { stage: EnquiryStatus; cards: PipelineCard[]; stages: EnquiryStatus[]; onMove: (id: string, stage: EnquiryStatus) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const value = cards.reduce((sum, card) => sum + card.valueCents, 0);
  return (
    <section className={`flex h-full w-[300px] shrink-0 flex-col ${isOver ? "bg-accent/40" : ""}`}>
      <header className="sticky top-0 z-10 border-b border-border bg-background px-1 pb-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em]">{ENQUIRY_STATUS_LABELS[stage]} · {cards.length}</p>
        <p className="text-sm text-muted-foreground">{compactKsh(value)}</p>
      </header>
      <div ref={setNodeRef} className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {cards.map((card) => <CardView key={card.id} card={card} stages={stages} onMove={onMove} />)}
        {cards.length === 0 ? <p className="px-1 py-6 text-center text-xs text-muted-foreground">No opportunities here</p> : null}
      </div>
    </section>
  );
}

export function PipelineBoard({
  initial,
  lostReasons,
  owners,
  eventTypes,
  sources,
  visitsThisWeek,
  quotesWaiting,
}: {
  initial: PipelineCard[];
  lostReasons: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  eventTypes: string[];
  sources: string[];
  visitsThisWeek: number;
  quotesWaiting: number;
}) {
  const [cards, setCards] = useState(initial);
  const [pendingLost, setPendingLost] = useState<string | null>(null);
  const [reason, setReason] = useState(lostReasons[0]?.id || "");
  const [showClosed, setShowClosed] = useState(false);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [eventType, setEventType] = useState("");
  const [month, setMonth] = useState("");
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [mobileStage, setMobileStage] = useState<EnquiryStatus>("new");
  const [edges, setEdges] = useState({ left: false, right: false });
  const scroller = useRef<HTMLDivElement>(null);
  const dragScroll = useRef<{ x: number; left: number } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const stages: EnquiryStatus[] = showClosed ? [...ENQUIRY_STAGES, ...ENQUIRY_EXITS] : [...ENQUIRY_STAGES];
  const today = nairobiDay(new Date());

  const active = useMemo(() => cards.filter((card) => ENQUIRY_STAGES.includes(card.stage as (typeof ENQUIRY_STAGES)[number])), [cards]);
  const activeValue = active.reduce((sum, card) => sum + card.valueCents, 0);
  const followUps = active.filter((card) => {
    const tone = followUp(card, today).tone;
    return tone === "overdue" || tone === "today" || tone === "missing";
  }).length;
  const deposits = active.filter((card) => card.stage === "deposit_pending").length;
  const months = [...new Set(cards.map((card) => card.month).filter(Boolean))].sort();

  const visible = cards.filter((card) => {
    if (!showClosed && ENQUIRY_EXITS.includes(card.stage as (typeof ENQUIRY_EXITS)[number])) return false;
    if (owner && card.ownerId !== owner) return false;
    if (eventType && card.eventType !== eventType) return false;
    if (month && card.month !== month) return false;
    if (source && card.source !== source) return false;
    if (priority && card.priority !== priority) return false;
    if (needsFollowUp) {
      const tone = followUp(card, today).tone;
      if (tone !== "overdue" && tone !== "today" && tone !== "missing") return false;
    }
    if (query.trim()) {
      const haystack = `${card.title} ${card.eventType} ${card.owner} ${card.reference}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const sync = () => setEdges({
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
    });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    el.addEventListener("scroll", sync, { passive: true });
    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", sync);
      el.removeEventListener("wheel", onWheel);
    };
  }, [showClosed, visible.length]);

  function scrollByColumn(direction: number) {
    scroller.current?.scrollBy({ left: direction * 312, behavior: "smooth" });
  }

  async function move(id: string, stage: EnquiryStatus, lostReasonId?: string) {
    const previous = cards;
    setCards((current) => current.map((card) => card.id === id ? { ...card, stage } : card));
    const result = await transitionEnquiryAction({ id, stage, lostReasonId: lostReasonId || "" });
    if (!result.ok) {
      setCards(previous);
      toast.error(result.error);
    }
  }

  function requestMove(id: string, stage: EnquiryStatus) {
    if (stage === "lost") {
      setPendingLost(id);
      return;
    }
    void move(id, stage);
  }

  function onDragEnd(event: DragEndEvent) {
    const stage = String(event.over?.id || "") as EnquiryStatus;
    if (!stages.includes(stage)) return;
    requestMove(String(event.active.id), stage);
  }

  const mobileCards = visible.filter((card) => card.stage === mobileStage);
  const mobileValue = mobileCards.reduce((sum, card) => sum + card.valueCents, 0);
  const mobileIndex = Math.max(0, stages.indexOf(mobileStage));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Sales</p>
          <h1 className="font-display text-2xl leading-none">Active pipeline</h1>
          <p className="mt-1 text-sm">{active.length} opportunities · {formatKsh(activeValue)} potential value</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Needs follow-up {followUps}
          <span className="px-2">·</span>
          Site visits this week {visitsThisWeek}
          <span className="px-2">·</span>
          Quotes awaiting response {quotesWaiting}
          <span className="px-2">·</span>
          Deposit pending {deposits}
        </p>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-8 w-36 border border-border bg-card px-2 text-xs" />
        <select value={owner} onChange={(event) => setOwner(event.target.value)} className="h-8 border border-border bg-card px-2 text-xs"><option value="">All owners</option>{owners.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
        <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="h-8 border border-border bg-card px-2 text-xs"><option value="">All event types</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
        <select value={month} onChange={(event) => setMonth(event.target.value)} className="h-8 border border-border bg-card px-2 text-xs"><option value="">Any month</option>{months.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select value={source} onChange={(event) => setSource(event.target.value)} className="h-8 border border-border bg-card px-2 text-xs"><option value="">All sources</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-8 border border-border bg-card px-2 text-xs"><option value="">Any priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>
        <label className="flex h-8 items-center gap-2 px-1 text-xs"><input type="checkbox" checked={needsFollowUp} onChange={(event) => setNeedsFollowUp(event.target.checked)} /> Needs follow-up</label>
        <label className="flex h-8 items-center gap-2 px-1 text-xs"><input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} /> Lost, cancelled, postponed</label>
      </div>

      <div className="relative hidden min-h-0 flex-1 md:block">
        {edges.left ? <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r from-background to-transparent" /> : null}
        {edges.right ? <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-background to-transparent" /> : null}
        <button type="button" className="absolute left-0 top-0 z-20 flex h-7 w-7 items-center justify-center border border-border bg-card" aria-label="Previous stages" onClick={() => scrollByColumn(-1)}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" className="absolute right-0 top-0 z-20 flex h-7 w-7 items-center justify-center border border-border bg-card" aria-label="Next stages" onClick={() => scrollByColumn(1)}><ChevronRight className="h-4 w-4" /></button>
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div
            ref={scroller}
            className="flex h-full gap-3 overflow-x-auto overflow-y-hidden px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("article, a, button, select, input, label")) return;
              dragScroll.current = { x: event.clientX, left: scroller.current?.scrollLeft || 0 };
              (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!dragScroll.current || !scroller.current) return;
              scroller.current.scrollLeft = dragScroll.current.left - (event.clientX - dragScroll.current.x);
            }}
            onPointerUp={() => { dragScroll.current = null; }}
          >
            {stages.map((stage) => <Column key={stage} stage={stage} cards={visible.filter((card) => card.stage === stage)} stages={stages} onMove={requestMove} />)}
          </div>
        </DndContext>
      </div>

      <div className="md:hidden">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" className="flex h-9 w-9 items-center justify-center border border-border" aria-label="Previous stage" onClick={() => setMobileStage(stages[Math.max(0, mobileIndex - 1)])}><ChevronLeft className="h-4 w-4" /></button>
          <label className="min-w-0 flex-1 text-center text-sm">
            <span className="block text-xs uppercase tracking-[0.14em]">{ENQUIRY_STATUS_LABELS[mobileStage]} · {mobileCards.length}</span>
            <span className="text-muted-foreground">{compactKsh(mobileValue)}</span>
            <select className="mt-1 h-8 w-full border border-border bg-card px-2 text-xs" value={mobileStage} onChange={(event) => setMobileStage(event.target.value as EnquiryStatus)}>
              {stages.map((stage) => <option key={stage} value={stage}>{ENQUIRY_STATUS_LABELS[stage]}</option>)}
            </select>
          </label>
          <button type="button" className="flex h-9 w-9 items-center justify-center border border-border" aria-label="Next stage" onClick={() => setMobileStage(stages[Math.min(stages.length - 1, mobileIndex + 1)])}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2">
          {mobileCards.map((card) => <CardBody key={card.id} card={card} stages={stages} onMove={requestMove} />)}
          {mobileCards.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No opportunities here</p> : null}
        </div>
      </div>

      {pendingLost ? (
        <form className="fixed inset-x-3 bottom-3 z-40 max-w-sm border border-border bg-card p-3 shadow-lg md:left-auto md:right-6" onSubmit={async (event) => {
          event.preventDefault();
          await move(pendingLost, "lost", reason);
          setPendingLost(null);
        }}>
          <p className="text-sm font-medium">Why was this lost?</p>
          <select className="mt-2 h-9 w-full border border-border bg-background px-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)}>
            {lostReasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="h-8 bg-primary px-3 text-xs text-primary-foreground">Mark lost</button>
            <button type="button" className="h-8 border border-border px-3 text-xs" onClick={() => setPendingLost(null)}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
