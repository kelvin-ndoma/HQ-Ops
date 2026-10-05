import type { ClientSession } from "mongoose";
import { ActivityEvent, AuditLog } from "./models";
import { sessionOptions } from "./db";

export async function recordAudit(
  entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
  },
  session?: ClientSession | null,
) {
  await AuditLog.create(
    [
      {
        actorId: entry.actorId || undefined,
        action: entry.action,
        entityType: entry.entityType,
        entityId: String(entry.entityId),
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        reason: entry.reason || "",
      },
    ],
    sessionOptions(session),
  );
}

export async function recordActivity(
  entry: {
    entityType: string;
    entityId: string;
    summary: string;
    actorId?: string | null;
    kind?: string;
    metadata?: unknown;
  },
  session?: ClientSession | null,
) {
  await ActivityEvent.create(
    [
      {
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        actorId: entry.actorId || undefined,
        kind: entry.kind || "system",
        metadata: entry.metadata,
      },
    ],
    sessionOptions(session),
  );
}
