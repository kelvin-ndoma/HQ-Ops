"use client";

import { useRouter } from "next/navigation";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/server/actions";
import { Button } from "@/components/ui/button";

export function NotificationList({ items }: { items: { id: string; title: string; body: string; href: string; read: boolean; when: string }[] }) {
  const router = useRouter();
  return (
    <div>
      <Button variant="secondary" onClick={async () => { await markAllNotificationsReadAction(); router.refresh(); }}>Mark all read</Button>
      <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-card">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-3 text-sm">
            <a href={item.href || "/notifications"} className={item.read ? "text-muted-foreground" : "font-medium"}>
              <span className="block">{item.title}</span>
              <span className="block text-xs font-normal text-muted-foreground">{item.body} · {item.when}</span>
            </a>
            {!item.read ? <Button size="sm" variant="ghost" onClick={async () => { await markNotificationReadAction(item.id); router.refresh(); }}>Read</Button> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
