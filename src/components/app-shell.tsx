"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LogOut,
  Menu,
  ShoppingCart,
  Store,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/types";

const nav = [
  { href: "/caixa", label: "Caixa do dia", icon: ShoppingCart, roles: ["admin", "caixa"] },
  { href: "/admin", label: "Resumo de hoje", icon: ClipboardList, roles: ["admin"] },
  { href: "/estoque", label: "Estoque", icon: Boxes, roles: ["admin"] },
  { href: "/relatorios", label: "Historico", icon: BarChart3, roles: ["admin"] },
];

function NavLinks({ profile, onNavigate }: { profile: Profile; onNavigate?: () => void }) {
  const pathname = usePathname();
  const visible = nav.filter((item) => item.roles.includes(profile.role));

  return (
    <nav className="flex flex-col gap-1.5">
      {visible.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition duration-200",
              active
                ? "bg-accent text-white shadow-[0_10px_22px_rgba(47,125,244,0.18)]"
                : "text-slate-400 hover:bg-white/6 hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={2.1} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutForm() {
  return (
    <form action="/auth/signout" method="post">
      <button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-400 transition hover:bg-white/6 hover:text-foreground">
        <LogOut className="h-5 w-5" />
        Sair
      </button>
    </form>
  );
}

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="min-h-screen bg-transparent">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r border-line bg-[#0a0c10]/95 p-3 lg:flex lg:flex-col">
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white shadow-[0_12px_24px_rgba(47,125,244,0.22)]">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <p className="font-black">Viola PDV</p>
            <p className="text-xs text-muted">Operacao comercial</p>
          </div>
        </div>

        <NavLinks profile={profile} />

        <div className="mt-auto space-y-3">
          <div className="rounded-lg border border-line bg-panel p-3">
            <p className="truncate text-sm font-semibold">{profile.name}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">{profile.role}</p>
          </div>
          <LogoutForm />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex min-h-[60px] items-center justify-between border-b border-line bg-background/95 px-4 backdrop-blur-xl lg:hidden">
        <button
          aria-label="Abrir menu"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 font-bold">
          <ClipboardList className="h-5 w-5 text-accent" />
          Viola PDV
        </div>
        <form action="/auth/signout" method="post">
          <button
            aria-label="Sair"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </header>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="h-full w-80 max-w-[86vw] border-r border-line bg-[#0a0c10] p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="font-bold">Viola PDV</p>
                <p className="text-xs text-muted">{profile.name}</p>
              </div>
              <button
                aria-label="Fechar menu"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks profile={profile} onNavigate={() => setOpen(false)} />
            <div className="mt-6">
              <LogoutForm />
            </div>
          </div>
        </div>
      ) : null}

      <main className="lg:pl-[236px]">{children}</main>
    </div>
  );
}
