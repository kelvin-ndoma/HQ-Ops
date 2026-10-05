import { EnquireForm } from "@/app/enquire/enquire-form";
import { publicFormOptions } from "@/server/services/public-enquiry";
import { getOrganization } from "@/server/settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "Enquire with HQ" },
  description: "Tell HQ about a private event. The team will review your request and follow up.",
};

export default async function EnquirePage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const params = await searchParams;
  const token = typeof params.ref === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(params.ref) ? params.ref : "";
  const [options, org] = await Promise.all([publicFormOptions(), getOrganization()]);
  return (
    <main className="mx-auto w-full max-w-lg px-5 py-10 sm:py-16">
      <EnquireForm orgName={org.name} city={org.city} token={token} eventTypes={options.eventTypes} spaces={options.spaces} services={options.services} />
    </main>
  );
}
