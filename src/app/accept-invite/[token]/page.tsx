import { headers } from "next/headers";
import { AcceptInviteForm } from "@/components/forms/user-access";
import { previewInvitation } from "@/server/services/users";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Accept your HQ invitation" } };

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headerList = await headers();
  const ip = (headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local").slice(0, 64);
  let profile: { name: string; email: string; phone: string; jobTitle: string } | null = null;
  try {
    profile = await previewInvitation(token, ip);
  } catch {
    profile = null;
  }
  return (
    <main className="mx-auto w-full max-w-lg px-5 py-12">
      {profile ? <AcceptInviteForm token={token} {...profile} /> : (
        <section className="rounded-md border border-border bg-card px-5 py-8">
          <h1 className="font-display text-4xl text-primary">This invitation is not valid.</h1>
          <p className="mt-3 text-sm text-muted-foreground">Ask an administrator to send a new invitation.</p>
        </section>
      )}
    </main>
  );
}
