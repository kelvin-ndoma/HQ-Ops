import type { Permission } from "@/domain/permissions";

export type NavItem = { href: string; label: string; icon: string; permission?: Permission };

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ href: "/", label: "Command Centre", icon: "LayoutDashboard" }] },
  {
    label: "Sales",
    items: [
      { href: "/enquiries", label: "Enquiries", icon: "Inbox", permission: "enquiries.read" },
      { href: "/pipeline", label: "Pipeline", icon: "Columns3", permission: "enquiries.read" },
      { href: "/clients", label: "Clients", icon: "Users", permission: "clients.read" },
      { href: "/site-visits", label: "Site Visits", icon: "MapPin", permission: "visits.read" },
      { href: "/quotations", label: "Quotations", icon: "FileText", permission: "quotes.read" },
    ],
  },
  {
    label: "Events",
    items: [
      { href: "/calendar", label: "Calendar", icon: "Calendar", permission: "bookings.read" },
      { href: "/bookings", label: "Bookings", icon: "BookMarked", permission: "bookings.read" },
      { href: "/events", label: "Events", icon: "CalendarDays", permission: "events.read" },
      { href: "/tasks", label: "Tasks", icon: "ListTodo", permission: "tasks.read" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/inventory", label: "Inventory", icon: "Boxes", permission: "inventory.read" },
      { href: "/vendors", label: "Vendors", icon: "Store", permission: "vendors.read" },
      { href: "/procurement", label: "Procurement", icon: "ShoppingCart", permission: "procurement.read" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/payments", label: "Payments", icon: "Wallet", permission: "payments.read" },
      { href: "/event-costs", label: "Event Costs", icon: "Receipt", permission: "costs.read" },
    ],
  },
  { label: "Insights", items: [{ href: "/reports", label: "Reports", icon: "BarChart3", permission: "reports.sales" }] },
  {
    label: "System",
    items: [
      { href: "/notifications", label: "Notifications", icon: "Bell", permission: "notifications.read" },
      { href: "/activity", label: "Activity Log", icon: "ScrollText", permission: "audit.read" },
      { href: "/settings", label: "Settings", icon: "Settings", permission: "settings.read" },
    ],
  },
];

export const QUICK_CREATE: { href: string; label: string; permission: Permission }[] = [
  { href: "/enquiries/new", label: "Enquiry", permission: "enquiries.write" },
  { href: "/clients/new", label: "Client", permission: "clients.write" },
  { href: "/site-visits/new", label: "Site Visit", permission: "visits.write" },
  { href: "/tasks/new", label: "Task", permission: "tasks.write" },
  { href: "/vendors/new", label: "Vendor", permission: "vendors.write" },
  { href: "/payments/new", label: "Payment", permission: "payments.write" },
  { href: "/inventory/move", label: "Stock Movement", permission: "inventory.move" },
];
