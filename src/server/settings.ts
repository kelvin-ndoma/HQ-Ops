import {
  DEFAULT_ASSIGNMENT,
  DEFAULT_AUTOMATION,
  DEFAULT_COMMERCIAL,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_ORGANIZATION,
  SETTING_KEYS,
  type AssignmentSettings,
  type AutomationSettings,
  type CommercialSettings,
  type NotificationSettings,
  type OrganizationSettings,
} from "../domain/settings";
import { connectDB } from "./db";
import { recordAudit } from "./audit";
import { SystemSetting } from "./models";

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  await connectDB();
  const doc = await SystemSetting.findOne({ key }).lean<{ value?: T } | null>();
  if (!doc?.value || typeof doc.value !== "object") return fallback;
  return { ...fallback, ...(doc.value as T) };
}

export function getOrganization() {
  return readSetting<OrganizationSettings>(SETTING_KEYS.organization, DEFAULT_ORGANIZATION);
}
export function getCommercial() {
  return readSetting<CommercialSettings>(SETTING_KEYS.commercial, DEFAULT_COMMERCIAL);
}
export function getAutomation() {
  return readSetting<AutomationSettings>(SETTING_KEYS.automation, DEFAULT_AUTOMATION);
}
export function getNotificationSettings() {
  return readSetting<NotificationSettings>(SETTING_KEYS.notifications, DEFAULT_NOTIFICATIONS);
}
export function getAssignment() {
  return readSetting<AssignmentSettings>(SETTING_KEYS.assignment, DEFAULT_ASSIGNMENT);
}

export async function saveSetting(actorId: string, key: string, value: unknown, previous?: unknown) {
  await connectDB();
  await SystemSetting.findOneAndUpdate(
    { key },
    { value, updatedBy: actorId },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  await recordAudit({
    actorId,
    action: "settings.update",
    entityType: "setting",
    entityId: key,
    previousValue: previous,
    newValue: value,
  });
}
