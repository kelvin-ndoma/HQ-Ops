import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/page";
import { AutomationForm, CatalogEditor, CommercialForm, NotificationPrefs, OrganizationForm, UserAdmin } from "@/components/forms/settings-forms";
import { requirePermission, requireUser } from "@/server/guard";
import { EventType, InventoryCategory, LeadSource, LostReason, PaymentMethod, ServiceItem, Space, VendorCategory } from "@/server/models";
import { getAutomation, getCommercial, getNotificationSettings, getOrganization } from "@/server/settings";
import { listUsers } from "@/server/services/users";
import type { Role } from "@/domain/permissions";

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
  const writable = can(user.role, "settings.write");
  const rows = (items: { _id: unknown; name: string }[]) => items.map((item) => ({ id: String(item._id), name: item.name }));
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="System" title="Settings" description="Spaces, sources, deposit rules and timings live here so ordinary operating changes do not need a code release." />
      <section><h2 className="mb-3 font-medium">Organisation</h2>{writable ? <OrganizationForm value={org} /> : <p className="text-sm">{org.name}, {org.city}</p>}</section>
      <section><h2 className="mb-3 font-medium">Commercial rules</h2>{writable ? <CommercialForm value={{ ...commercial, mode: commercial.deposit.mode, percent: commercial.deposit.percent, fixedShillings: commercial.deposit.fixedCents == null ? null : commercial.deposit.fixedCents / 100 }} /> : <p className="text-sm">Deposit mode {commercial.deposit.mode}</p>}</section>
      <section><h2 className="mb-3 font-medium">Automation timing</h2>{writable ? <AutomationForm value={{ newEnquiryFollowUpHours: automation.newEnquiryFollowUpHours, visitReminderHours: automation.visitReminderHours, postVisitFollowUpHours: automation.postVisitFollowUpHours, quoteFollowUpDays: automation.quoteFollowUpDays, quoteInactivityDays: automation.quoteInactivityDays, depositFollowUpDays: automation.depositFollowUpDays }} /> : null}</section>
      <section><h2 className="mb-3 font-medium">Notifications</h2>{writable ? <NotificationPrefs value={notifications} /> : null}</section>
      <section className="grid gap-6 md:grid-cols-2">
        <div><h2 className="mb-2 font-medium">Event types</h2>{writable ? <CatalogEditor kind="event-type" rows={rows(eventTypes)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Lead sources</h2>{writable ? <CatalogEditor kind="source" rows={rows(sources)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Lost reasons</h2>{writable ? <CatalogEditor kind="lost-reason" rows={rows(reasons)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Spaces</h2>{writable ? <CatalogEditor kind="space" rows={spaces.map((space) => ({ id: String(space._id), name: space.name, extra: `${space.capacity} guests` }))} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Inventory categories</h2>{writable ? <CatalogEditor kind="inventory-category" rows={rows(inventoryCategories)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Vendor categories</h2>{writable ? <CatalogEditor kind="vendor-category" rows={rows(vendorCategories)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Payment methods</h2>{writable ? <CatalogEditor kind="payment-method" rows={rows(methods)} /> : null}</div>
        <div><h2 className="mb-2 font-medium">Service catalogue</h2>{writable ? <CatalogEditor kind="service" rows={services.map((service) => ({ id: String(service._id), name: service.name, extra: `KSh ${service.unitPriceCents / 100}` }))} /> : null}</div>
      </section>
      {can(user.role, "users.manage") ? <section><h2 className="mb-3 font-medium">Users and roles</h2><UserAdmin users={users.map((person) => ({ id: String(person._id), name: person.name, email: person.email, role: person.role as Role, active: person.active }))} /></section> : null}
    </div>
  );
}
