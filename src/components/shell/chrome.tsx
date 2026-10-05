"use client";

import {
  BarChart3,
  Bell,
  BookMarked,
  Boxes,
  Calendar,
  CalendarDays,
  Columns3,
  FileText,
  Inbox,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ROLE_LABELS, type Role } from "@/domain/permissions";
import { useRouter } from "next/navigation";
import { NAV, QUICK_CREATE, type NavItem } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Inbox, Columns3, Users, MapPin, FileText, Calendar, BookMarked, CalendarDays, ListTodo, Boxes, Store, ShoppingCart, Wallet, Receipt, BarChart3, Bell, ScrollText, Settings,
};

function NavLinks({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-5">
      {NAV.map((group) => {
        const visible = group.items.filter((item) => items.some((allowed) => allowed.href === item.href));
        if (visible.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-muted">{group.label}</p>
            <div className="mt-1">
              {visible.map((item) => {
                const Icon = ICONS[item.icon] || LayoutDashboard;
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80",
                      active && "bg-white/10 text-sidebar-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const label = ROLE_LABELS[role as Role] || role;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "HQ";

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        className="flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-0.5 pr-3 hover:bg-muted"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium leading-none text-primary-foreground">{initials}</span>
        <span className="hidden max-w-[9rem] truncate text-sm sm:inline">{name}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 w-72 rounded-lg border border-border bg-card p-2 shadow-lg" role="menu">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{initials}</span>
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
          <div className="my-1 border-t border-border" />
          <a href="/account" className="block rounded-md px-2 py-2 text-sm hover:bg-muted" role="menuitem" onClick={() => setOpen(false)}>Account and password</a>
          <form action="/api/auth/logout" method="post">
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" type="submit" role="menuitem">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function Chrome({
  user,
  unread,
  items,
  quick,
  pathname,
  children,
}: {
  user: { name: string; email: string; role: string };
  unread: number;
  items: NavItem[];
  quick: { href: string; label: string }[];
  pathname: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ type: string; label: string; hint?: string; href: string }[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const handle = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const json = await response.json();
      setResults(json.results || []);
    }, 180);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-[240px] flex-col overflow-y-auto bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 shrink-0 items-end px-4 pb-3">
          <Link href="/" className="leading-none">
            <span className="font-display text-2xl">HQ</span>
            <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-sidebar-muted">Operations</span>
          </Link>
        </div>
        <div className="px-2 pb-6">
          <NavLinks items={items} pathname={pathname} />
        </div>
      </aside>
      <div className="min-w-0 md:pl-[240px]">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-6">
          <button className="rounded-md p-2 md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <button className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm text-muted-foreground md:max-w-md" onClick={() => setSearchOpen(true)}>
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Search clients, phone, references</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Quick Create</span>
            </Button>
            <a href="/notifications" className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unread > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" /> : null}
            </a>
            <ProfileMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-3 py-5 md:px-6">{children}</main>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 bg-stone-950/50 md:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[260px] overflow-auto bg-sidebar p-3 text-sidebar-foreground" onClick={(event) => event.stopPropagation()}>
            <button className="mb-4 rounded p-1" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button>
            <NavLinks items={items} pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
      {searchOpen ? (
        <div className="fixed inset-0 z-50 bg-stone-950/40 p-4" onClick={() => setSearchOpen(false)}>
          <div className="mx-auto mt-16 max-w-xl rounded-lg border border-border bg-card p-3" onClick={(event) => event.stopPropagation()}>
            <Input autoFocus placeholder="Name, company, phone, ENQ, QUO, BKG, HQ" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="mt-2 max-h-80 overflow-auto">
              {results.map((result) => (
                <button key={result.href + result.label} className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { setSearchOpen(false); router.push(result.href); }}>
                  <span>{result.label}<span className="ml-2 text-muted-foreground">{result.hint}</span></span>
                  <span className="text-[11px] uppercase text-muted-foreground">{result.type}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {createOpen ? (
        <div className="fixed inset-0 z-50 bg-stone-950/40 p-4" onClick={() => setCreateOpen(false)}>
          <div className="mx-auto mt-20 w-full max-w-sm rounded-lg border border-border bg-card p-3" onClick={(event) => event.stopPropagation()}>
            <p className="px-2 pb-2 text-sm font-medium">Quick create</p>
            {quick.length === 0 ? <p className="px-2 text-sm text-muted-foreground">Nothing you can create with this role.</p> : quick.map((item) => (
              <a key={item.href} href={item.href} className="block rounded px-2 py-2 text-sm hover:bg-muted">{item.label}</a>
            ))}
            {QUICK_CREATE.length > quick.length ? null : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
