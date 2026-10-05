import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can } from "@/domain/permissions";
import { NAV, QUICK_CREATE } from "@/components/nav";
import { Chrome } from "@/components/shell/chrome";
import { requireUser } from "@/server/guard";
import { connectDB } from "@/server/db";
import { Notification } from "@/server/models";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    await connectDB();
    user = await requireUser();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("MONGODB_URI") || message.includes("ECONNREFUSED") || message.includes("failed to connect")) {
      return (
        <div className="mx-auto max-w-lg px-6 py-20">
          <p className="font-display text-3xl">HQ cannot reach its database.</p>
          <p className="mt-3 text-sm text-muted-foreground">Set MONGODB_URI in .env.local, or run npm run dev:local to start an embedded development database.</p>
        </div>
      );
    }
    throw error;
  }
  const headerList = await headers();
  const pathname = headerList.get("x-hq-path") || "/";
  const unread = await Notification.countDocuments({ userId: user.id, readAt: null });
  const items = NAV.flatMap((group) => group.items).filter((item) => {
    if (item.anyOf?.length) return item.anyOf.some((permission) => can(user.role, permission));
    return !item.permission || can(user.role, item.permission);
  });
  const quick = QUICK_CREATE.filter((item) => can(user.role, item.permission));
  return (
    <Chrome user={{ name: user.name, email: user.email, role: user.role }} unread={unread} items={items} quick={quick} pathname={pathname}>
      {children}
    </Chrome>
  );
}

void redirect;
