import { formatWhen } from "@/domain/operations";
import { NotificationList } from "@/components/forms/notification-list";
import { PageHeader } from "@/components/page";
import { requireUser } from "@/server/guard";
import { listNotifications } from "@/server/services/insights";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notes = await listNotifications(user.id);
  return (
    <div>
      <PageHeader eyebrow="System" title="Notifications" description="In-app alerts are live. Email and WhatsApp adapters exist so a provider can be added later without rewriting the rules." />
      <NotificationList items={notes.map((note) => ({ id: String(note._id), title: note.title, body: note.body, href: note.href, read: Boolean(note.readAt), when: formatWhen(note.createdAt, "Africa/Nairobi", true) }))} />
    </div>
  );
}
