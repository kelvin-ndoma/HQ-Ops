import { recordActivity, recordAudit } from "./audit";
import { AppError } from "./errors";
import { OverrideLog } from "./models";

export async function recordOverride(entry: {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string;
  permission: string;
}) {
  const reason = entry.reason.trim();
  if (reason.length < 3) {
    throw new AppError("An override needs a reason.");
  }
  await OverrideLog.create({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    reason,
    permission: entry.permission,
    actorId: entry.actorId,
  });
  await recordAudit({
    actorId: entry.actorId,
    action: "override",
    entityType: entry.entityType,
    entityId: entry.entityId,
    newValue: { action: entry.action, permission: entry.permission },
    reason,
  });
  await recordActivity({
    entityType: entry.entityType,
    entityId: entry.entityId,
    actorId: entry.actorId,
    kind: "override",
    summary: `Override · ${entry.action.replaceAll("_", " ")}. ${reason}`,
  });
}
