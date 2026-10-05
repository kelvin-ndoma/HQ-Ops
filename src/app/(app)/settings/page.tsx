import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/page";
import Link from "next/link";
import { AutomationForm, CatalogEditor, CommercialForm, NotificationPrefs, OrganizationForm } from "@/components/forms/settings-forms";
import { requirePermission, requireUser } from "@/server/guard";
import { EventType, InventoryCategory, LeadSource, LostReason, PaymentMethod, ServiceItem, Space, VendorCategory } from "@/server/models";
import { getAutomation, getCommercial, getNotificationSettings, getOrganization } from "@/server/settings";
import { listUsers } from "@/server/services/users";

export default async function SettingsPage() {
  const user = await requireUser();
  requirePermission(user, "settings.read");
  const [org, commercial, automation, notifications, eventTypes, sources, reasons, inventoryCategories, vendorCategories, methods, spaces, services, users] = await Promise.all([
    getOrganization(),
    getCommercial(),
    getAutomation(),
    getNotificationSettings(),
    EventType.find().sort({ name: 1 }).lean(),
    LeadSource.find().sort({ name: 1 }).lean(),
    LostReason.find().sort({ name: 1 }).lean(),
    InventoryCategory.find().sort({ name: 1 }).lean(),
    VendorCategory.find().sort({ name: 1 }).lean(),
    PaymentMethod.find().sort({ name: 1 }).lean(),
    Space.find().sort({ name: 1 }).lean(),
    ServiceItem.find().sort({ name: 1 }).lean(),
    can(user.role, "users.read") ? listUsers() : Promise.resolve([]),
  ]);
  const operations = can(user.role, "settings.operations");
  const commercialAccess = can(user.role, "settings.commercial");
  const system = can(user.role, "settings.system");
  const rows = (items: { _id: unknown; name: string }[]) => items.map((item) => ({ id: String(item._id), name: item.name }));
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="System" title="Settings" description="Operational catalogues, commercial rules, and system administration are separate permissions." />
      <section><h2 className="mb-3 font-medium">Organisation</h2>{system ? <OrganizationForm value={org} /> : <p className="text-sm">{org.name}, {org.city}</p>}</section>
      <section>
        <h2 className="mb-3 font-medium">Commercial rules</h2>
        <p className="mb-3 text-xs text-muted-foreground">Approval thresholds are development configuration until HQ sets them. A blank threshold means that gate is off.</p>
        {commercialAccess ? <CommercialForm value={{ ...commercial, mode: commercial.deposit.mode, percent: commercial.deposit.percent, fixedShillings: commercial.deposit.fixedCents == null ? null : commercial.deposit.fixedCents / 100 }} /> : <p className="text-sm">Deposit mode {commercial.deposit.mode}. Discount gate {commercial.approvals.maxDiscountPercent ?? "off"}.</p>}
      </section>
      <section><h2 className="mb-3 font-medium">Operational timing and checklists</h2>{operations ? <AutomationForm value={{ newEnquiryFollowUpHours: automation.newEnquiryFollowUpHours, visitReminderHours: automation.visitReminderHours, postVisitFollowUpHours: automation.postVisitFollowUpHours, quoteFollowUpDays: automation.quoteFollowUpDays, quoteInactivityDays: automation.quoteInactivityDays, depositFollowUpDays: automation.depositFollowUpDays }} /> : null}</section>
      <section><h2 className="mb-3 font-medium">Notifications</h2>{system ? <NotificationPrefs value={notifications} /> : null}</section>
      <section className="grid gap-6 md:grid-cols-2">
        <div><h2 className="mb-2 font-medium">Event types</h2>{operations ? <CatalogEditor kind="event-type" rows={rows(eventTypes)} /> : <p className="text-sm">{eventTypes.map((item) => item.name).join(", ")}</p>}</div>
        <div><h2 className="mb-2 font-medium">Lead sources</h2>{commercialAccess ? <CatalogEditor kind="source" rows={rows(sources)} /> : <p className="text-sm">{sources.map((item) => item.name).join(", ")}</p>}</div>
        <div><h2 className="mb-2 font-medium">Lost reasons</h2>{commercialAccess ? <CatalogEditor kind="lost-reason" rows={rows(reasons)} /> : <p className="text-sm">{reasons.map((item) => item.name).join(", ")}</p>}</div>
        <div><h2 className="mb-2 font-medium">Spaces</h2>{operations ? <CatalogEditor kind="space" rows={spaces.map((space) => ({ id: String(space._id), name: space.name, extra: `${space.capacity} guests` }))} /> : <p className="text-sm">{spaces.map((space) => space.name).join(", ")}</p>}</div>
        <div><h2 className="mb-2 font-medium">Inventory categories</h2>{operations ? <CatalogEditor kind="inventory-category" rows={rows(inventoryCategories)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Vendor categories</h2>{operations ? <CatalogEditor kind="vendor-category" rows={rows(vendorCategories)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Payment methods</h2>{commercialAccess ? <CatalogEditor kind="payment-method" rows={rows(methods)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Service catalogue</h2>{commercialAccess ? <CatalogEditor kind="service" rows={services.map((service) => ({ id: String(service._id), name: service.name, extra: `KSh ${service.unitPriceCents / 100}` }))} /> : null}</div>
      </section>
      {can(user.role, "users.read") ? <section><h2 className="mb-3 font-medium">Users and access</h2><p className="mb-3 text-sm text-muted-foreground">{users.length} people. Invitations, roles and access live on their own page.</p><Link className="text-sm underline" href="/settings/users">Open users and access</Link></section> : null}
    </div>
  );
}
