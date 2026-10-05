"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
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
  quotationId: string;
};

export type PipelineAccess = {
  move: boolean;
  visit: boolean;
  quoteRead: boolean;
  quoteWrite: boolean;
  task: boolean;
};

type FollowUp = { label: string; tone: "overdue" | "today" | "missing" | "plain" };

function nairobiDay(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function shortDate(value: string | null) {
  if (!value) return "Date not set";
  return new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }).format(new Date(value));
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en-KE", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
}

function followUp(card: PipelineCard, today: string): FollowUp {
  if (!card.nextAction && !card.nextActionAt) return { label: "No next action", tone: "missing" };
  if (!card.nextActionAt) return { label: card.nextAction, tone: "plain" };
  const due = nairobiDay(new Date(card.nextActionAt));
  if (due < today) return { label: "Follow-up overdue", tone: "overdue" };
  if (due === today) return { label: "Follow up today", tone: "today" };
  return { label: card.nextAction || `Follow up ${shortDate(card.nextActionAt)}`, tone: "plain" };
}

function plural(count: number, singular: string, pluralLabel: string) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function CardMenu({
  card,
  access,
  stages,
  onMove,
  onLost,
}: {
  card: PipelineCard;
  access: PipelineAccess;
  stages: EnquiryStatus[];
  onMove: (id: string, stage: EnquiryStatus) => void;
  onLost: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const quoteHref = card.quotationId && access.quoteRead ? `/quotations/${card.quotationId}` : access.quoteWrite ? `/quotations/new?enquiry=${card.id}` : "";
  const quoteLabel = card.quotationId ? "View quotation" : "Create quotation";

  return (
    <div className="absolute bottom-1.5 right-1.5" ref={root}>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center text-sm tracking-widest text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Actions for ${card.title}`}
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 196) });
          setMoving(false);
          setOpen((value) => !value);
        }}
      >
        •••
      </button>
      {open ? (
        <div className="fixed z-50 w-48 border border-border bg-card py-1 text-sm shadow-lg" style={{ top: position.top, left: position.left }} role="menu">
          <a className="block px-3 py-1.5 hover:bg-muted" href={`/enquiries/${card.id}`} role="menuitem">Open opportunity</a>
          {access.move ? (
            <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-muted" role="menuitem" onClick={() => setMoving((value) => !value)}>Move stage</button>
          ) : null}
          {moving ? stages.filter((stage) => stage !== card.stage && stage !== "lost").map((stage) => (
            <button key={stage} type="button" className="block w-full px-3 py-1.5 pl-5 text-left text-xs hover:bg-muted" onClick={() => { setOpen(false); onMove(card.id, stage); }}>{ENQUIRY_STATUS_LABELS[stage]}</button>
          )) : null}
          {access.visit ? <a className="block px-3 py-1.5 hover:bg-muted" href={`/site-visits/new?enquiry=${card.id}`} role="menuitem">Schedule site visit</a> : null}
          {quoteHref ? <a className="block px-3 py-1.5 hover:bg-muted" href={quoteHref} role="menuitem">{quoteLabel}</a> : null}
          {access.task ? <a className="block px-3 py-1.5 hover:bg-muted" href="/tasks/new" role="menuitem">Add task</a> : null}
          {access.move ? <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-muted" role="menuitem" onClick={() => { setOpen(false); onLost(card.id); }}>Mark lost</button> : null}
          {access.move && card.stage !== "postponed" ? <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-muted" role="menuitem" onClick={() => { setOpen(false); onMove(card.id, "postponed"); }}>Postpone</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function CardFace({
  card,
  access,
  stages,
  onMove,
  onLost,
  drag,
}: {
  card: PipelineCard;
  access: PipelineAccess;
  stages: EnquiryStatus[];
  onMove: (id: string, stage: EnquiryStatus) => void;
  onLost: (id: string) => void;
  drag?: Record<string, unknown>;
}) {
  const today = nairobiDay(new Date());
  const follow = followUp(card, today);
  const important = card.priority === "high" || card.priority === "urgent";
  const meta = [card.eventType, shortDate(card.date), card.guests ? `${card.guests} guests` : ""].filter(Boolean).join(" · ");
  const followClass = follow.tone === "overdue" ? "text-destructive" : follow.tone === "today" || follow.tone === "missing" ? "text-warning" : "text-muted-foreground";
  const edge = follow.tone === "overdue" ? "border-l-2 border-l-destructive" : important ? "border-l-2 border-l-primary" : "";
  return (
    <article className={`relative border border-border bg-card ${edge}`} {...drag}>
      <a href={`/enquiries/${card.id}`} className="block px-3 py-2.5 pr-9">
        <p className="truncate text-sm font-medium leading-5">
          {important ? <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" aria-label={card.priority === "urgent" ? "Urgent" : "High priority"} /> : null}
          {card.title}
        </p>
        <p className="truncate text-xs leading-5 text-muted-foreground">{meta}</p>
        <p className="mt-1 text-sm font-medium leading-5">{formatKsh(card.valueCents)}</p>
        <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
          {card.owner || "No owner"}
          <span> · </span>
          <span className={followClass}>{follow.label}</span>
        </p>
      </a>
      <CardMenu card={card} access={access} stages={stages} onMove={onMove} onLost={onLost} />
    </article>
  );
}

function DraggableCard(props: Omit<Parameters<typeof CardFace>[0], "drag">) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: props.card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : undefined}>
      <CardFace {...props} drag={{ ...listeners, ...attributes }} />
    </div>
  );
}

function StageTab({
  stage,
  count,
  selected,
  onSelect,
}: {
  stage: EnquiryStatus;
  count: number;
  selected: boolean;
  onSelect: (stage: EnquiryStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(stage)}
      className={`inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border bg-card text-foreground hover:bg-muted"} ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <span className="truncate">{ENQUIRY_STATUS_LABELS[stage]}</span>
      <span className={selected ? "text-primary-foreground/80" : "text-muted-foreground"}>{count}</span>
    </button>
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
  access,
}: {
  initial: PipelineCard[];
  lostReasons: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  eventTypes: string[];
  sources: string[];
  visitsThisWeek: number;
  quotesWaiting: number;
  access: PipelineAccess;
}) {
  const [cards, setCards] = useState(initial);
  const [pendingLost, setPendingLost] = useState<string | null>(null);
  const [reason, setReason] = useState(lostReasons[0]?.id || "");
  const [showClosed, setShowClosed] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [eventType, setEventType] = useState("");
  const [month, setMonth] = useState("");
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [selected, setSelected] = useState<EnquiryStatus>("new");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const stages: EnquiryStatus[] = showClosed ? [...ENQUIRY_STAGES, ...ENQUIRY_EXITS] : [...ENQUIRY_STAGES];
  const today = nairobiDay(new Date());

  const active = useMemo(() => cards.filter((card) => ENQUIRY_STAGES.includes(card.stage as (typeof ENQUIRY_STAGES)[number])), [cards]);
  const activeValue = active.reduce((sum, card) => sum + card.valueCents, 0);
  const followUps = active.filter((card) => ["overdue", "today", "missing"].includes(followUp(card, today).tone)).length;
  const deposits = active.filter((card) => card.stage === "deposit_pending").length;
  const months = [...new Set(cards.map((card) => card.month).filter(Boolean))].sort();

  const visible = cards.filter((card) => {
    if (!showClosed && ENQUIRY_EXITS.includes(card.stage as (typeof ENQUIRY_EXITS)[number])) return false;
    if (owner && card.ownerId !== owner) return false;
    if (eventType && card.eventType !== eventType) return false;
    if (month && card.month !== month) return false;
    if (source && card.source !== source) return false;
    if (priority && card.priority !== priority) return false;
    if (needsFollowUp && !["overdue", "today", "missing"].includes(followUp(card, today).tone)) return false;
    if (query.trim()) {
      const haystack = `${card.title} ${card.eventType} ${card.owner} ${card.reference}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  const chips = [
    eventType ? { id: "eventType", label: eventType, clear: () => setEventType("") } : null,
    source ? { id: "source", label: source, clear: () => setSource("") } : null,
    priority ? { id: "priority", label: priority, clear: () => setPriority("") } : null,
    needsFollowUp ? { id: "follow", label: "Needs follow-up", clear: () => setNeedsFollowUp(false) } : null,
    showClosed ? { id: "closed", label: "Lost, cancelled, postponed", clear: () => setShowClosed(false) } : null,
  ].filter((chip): chip is { id: string; label: string; clear: () => void } => Boolean(chip));

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
    if (!access.move) return;
    if (stage === "lost") {
      setPendingLost(id);
      return;
    }
    void move(id, stage);
  }

  function onDragEnd(event: DragEndEvent) {
    const next = String(event.over?.id || "") as EnquiryStatus;
    if (!stages.includes(next)) return;
    const current = cards.find((card) => card.id === String(event.active.id));
    if (!current || current.stage === next) return;
    requestMove(current.id, next);
  }

  const field = "h-8 border border-border bg-card px-2 text-xs";
  const stage = stages.includes(selected) ? selected : stages[0];
  const stageCards = visible.filter((card) => card.stage === stage);

  return (
    <div>
      <div className="mb-4 max-w-3xl">
        <h1 className="font-display text-2xl leading-none">Pipeline</h1>
        <p className="mt-2 text-sm">{formatKsh(activeValue)} active pipeline · {plural(active.length, "opportunity", "opportunities")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {plural(followUps, "needs follow-up", "need follow-up")}
          <span> · </span>
          {plural(visitsThisWeek, "site visit this week", "site visits this week")}
          <span> · </span>
          {plural(quotesWaiting, "quote awaiting response", "quotes awaiting response")}
          <span> · </span>
          {plural(deposits, "deposit pending", "deposits pending")}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className={`${field} w-40`} />
        <select value={owner} onChange={(event) => setOwner(event.target.value)} className={field} aria-label="Owner">
          <option value="">Owner</option>
          {owners.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <select value={month} onChange={(event) => setMonth(event.target.value)} className={field} aria-label="Event month">
          <option value="">Event month</option>
          {months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
        </select>
        <button type="button" className={field} aria-expanded={moreFilters} onClick={() => setMoreFilters((value) => !value)}>More filters</button>
      </div>
      {moreFilters ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={eventType} onChange={(event) => setEventType(event.target.value)} className={field} aria-label="Event type">
            <option value="">Event type</option>
            {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={source} onChange={(event) => setSource(event.target.value)} className={field} aria-label="Source">
            <option value="">Source</option>
            {sources.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className={field} aria-label="Priority">
            <option value="">Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <label className="flex h-8 items-center gap-2 px-1 text-xs"><input type="checkbox" checked={needsFollowUp} onChange={(event) => setNeedsFollowUp(event.target.checked)} /> Needs follow-up</label>
          <label className="flex h-8 items-center gap-2 px-1 text-xs"><input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} /> Include lost, cancelled, postponed</label>
        </div>
      ) : null}
      {chips.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button key={chip.id} type="button" className="h-7 border border-border bg-card px-2 text-xs" onClick={chip.clear}>{chip.label} ×</button>
          ))}
        </div>
      ) : null}

      <DndContext id="pipeline-board" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="mb-3 flex gap-1.5">
          {stages.map((item) => {
            const count = visible.filter((card) => card.stage === item).length;
            return <StageTab key={item} stage={item} count={count} selected={item === stage} onSelect={setSelected} />;
          })}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {stageCards.map((card) => <DraggableCard key={card.id} card={card} access={access} stages={stages} onMove={requestMove} onLost={setPendingLost} />)}
        </div>
        {stageCards.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No opportunities in {ENQUIRY_STATUS_LABELS[stage]}</p> : null}
      </DndContext>

      {pendingLost ? (
        <form className="fixed inset-x-3 bottom-3 z-50 max-w-sm border border-border bg-card p-3 shadow-lg md:left-auto md:right-6" onSubmit={async (event) => {
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
