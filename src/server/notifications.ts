import type { NotificationSettings } from "../domain/settings";
import { connectDB } from "./db";
import { getNotificationSettings } from "./settings";
import { Notification, User } from "./models";

export type OutboundNotification = {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  dedupeKey?: string;
};

export interface NotificationChannel {
  id: "in_app" | "email" | "whatsapp";
  send(message: OutboundNotification, settings: NotificationSettings): Promise<"sent" | "skipped">;
}

const inApp: NotificationChannel = {
  id: "in_app",
  async send(message, settings) {
    if (!settings.inApp) return "skipped";
    try {
      await Notification.create({
        userId: message.userId,
        type: message.type,
        title: message.title,
        body: message.body,
        href: message.href || "",
        dedupeKey: message.dedupeKey,
      });
      return "sent";
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === 11000) return "skipped";
      throw error;
    }
  },
};

/** Future email provider plugs in here. Nothing is sent until a provider is configured. */
const email: NotificationChannel = {
  id: "email",
  async send(_message, settings) {
    if (!settings.emailEnabled) return "skipped";
    return "skipped";
  },
};

/** Future WhatsApp Business adapter. The core never calls a vendor SDK directly. */
const whatsapp: NotificationChannel = {
  id: "whatsapp",
  async send(_message, settings) {
    if (!settings.whatsappEnabled) return "skipped";
    return "skipped";
  },
};

export const channels: NotificationChannel[] = [inApp, email, whatsapp];

export async function notify(message: OutboundNotification) {
  await connectDB();
  const settings = await getNotificationSettings();
  for (const channel of channels) {
    await channel.send(message, settings);
  }
}

export async function notifyRoles(
  roles: string[],
  message: Omit<OutboundNotification, "userId" | "dedupeKey"> & { dedupeKey?: string },
) {
  await connectDB();
  const users = await User.find({ role: { $in: roles }, active: true, archivedAt: null }).select("_id");
  await Promise.all(
    users.map((user) =>
      notify({
        ...message,
        userId: String(user._id),
        dedupeKey: message.dedupeKey ? `${message.dedupeKey}:${user._id}` : undefined,
      }),
    ),
  );
}
