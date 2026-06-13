"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadProjects } from "@/lib/projects";
import { countCaseAlerts, loadDismissed } from "@/lib/projectAlerts";

type NavItem = { href: string; label: string; icon: string; badge?: boolean; match: (p: string) => boolean };

// よく使う主要メニュー（常に表示）
const PRIMARY: NavItem[] = [
  { href: "/", label: "ホーム", icon: "🏠", match: (p) => p === "/" },
  { href: "/projects", label: "補助金チェック", icon: "🧾", match: (p) => p.startsWith("/projects") },
  { href: "/reminders", label: "通知", icon: "🔔", badge: true, match: (p) => p.startsWith("/reminders") },
  { href: "/search", label: "相談して探す", icon: "💬", match: (p) => p.startsWith("/search") },
  { href: "/settings", label: "設定", icon: "⚙️", match: (p) => p.startsWith("/settings") || p.startsWith("/profiles") || p.startsWith("/setup") || p.startsWith("/reports") },
];

// 参考・管理系（「その他」にまとめる）
const SECONDARY: NavItem[] = [
  { href: "/guide", label: "使い方ガイド", icon: "❓", match: (p) => p.startsWith("/guide") },
  { href: "/new", label: "新着の補助金", icon: "🆕", match: (p) => p === "/new" },
  { href: "/calendar", label: "締切カレンダー", icon: "🗓", match: (p) => p.startsWith("/calendar") },
  { href: "/new-and-standard", label: "定番制度", icon: "⭐", match: (p) => p.startsWith("/new-and-standard") },
  { href: "/discovery", label: "管理者画面", icon: "🛠", match: (p) => p === "/discovery" || p.startsWith("/discovery/") || p.startsWith("/admin") || p.startsWith("/grants") },
];

function useAlertCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = () => setN(countCaseAlerts(loadProjects(), loadDismissed()));
    refresh();
    window.addEventListener("projects-changed", refresh);
    window.addEventListener("alerts-changed", refresh);
    return () => {
      window.removeEventListener("projects-changed", refresh);
      window.removeEventListener("alerts-changed", refresh);
    };
  }, []);
  return n;
}

export function NavBar() {
  const pathname = usePathname() ?? "/";
  const alertCount = useAlertCount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const cls = (active: boolean) =>
    `relative flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 transition sm:px-3 ${active ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100 hover:text-ink"}`;
  const secondaryActive = SECONDARY.some((l) => l.match(pathname));

  return (
    <nav className="-mx-1 flex items-center gap-0.5 overflow-x-auto text-sm sm:mx-0 sm:flex-wrap sm:gap-1">
      {PRIMARY.map((l) => {
        const active = l.match(pathname);
        return (
          <Link key={l.href} href={l.href} className={cls(active)}>
            <span aria-hidden>{l.icon}</span>
            <span>{l.label}</span>
            {l.badge && alertCount > 0 && (
              <span className={`ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${active ? "bg-white text-accent" : "bg-red-500 text-white"}`}>
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </Link>
        );
      })}

      {/* その他（参考・管理系） */}
      <div ref={ref} className="relative shrink-0">
        <button onClick={() => setOpen((v) => !v)} className={cls(secondaryActive)} aria-expanded={open}>
          <span aria-hidden>⋯</span>
          <span>その他</span>
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border bg-white py-1 shadow-lg">
            {SECONDARY.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 text-sm ${l.match(pathname) ? "bg-accent/10 text-accent" : "text-gray-700 hover:bg-gray-50"}`}>
                <span aria-hidden>{l.icon}</span>
                <span>{l.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
