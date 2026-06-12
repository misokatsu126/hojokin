"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loadProjects } from "@/lib/projects";
import { countCaseAlerts, loadDismissed } from "@/lib/projectAlerts";

const LINKS = [
  { href: "/", label: "ホーム", icon: "🏠", badge: false, match: (p: string) => p === "/" },
  { href: "/projects", label: "補助金チェック", icon: "🧾", badge: false, match: (p: string) => p.startsWith("/projects") },
  { href: "/reminders", label: "通知", icon: "🔔", badge: true, match: (p: string) => p.startsWith("/reminders") },
  { href: "/search", label: "相談して探す", icon: "💬", badge: false, match: (p: string) => p.startsWith("/search") },
  { href: "/calendar", label: "締切カレンダー", icon: "🗓", badge: false, match: (p: string) => p.startsWith("/calendar") },
  { href: "/new-and-standard", label: "新着・定番", icon: "🆕", badge: false, match: (p: string) => p.startsWith("/new-and-standard") },
  { href: "/guide", label: "使い方ガイド", icon: "❓", badge: false, match: (p: string) => p.startsWith("/guide") },
  { href: "/settings", label: "設定", icon: "⚙️", badge: false, match: (p: string) => p.startsWith("/settings") || p.startsWith("/profiles") || p.startsWith("/setup") || p.startsWith("/reports") },
  { href: "/discovery", label: "管理者画面", icon: "🛠", badge: false, match: (p: string) => p === "/discovery" || p.startsWith("/discovery/") || p.startsWith("/admin") || p.startsWith("/grants") },
];

// 案件内シグナル（締切系を除く）の未対応件数。nav を軽くするため Supabase は読まない。
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
  return (
    <nav className="-mx-1 flex gap-0.5 overflow-x-auto text-sm sm:mx-0 sm:flex-wrap sm:gap-1">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 transition sm:px-3 ${
              active ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100 hover:text-ink"
            }`}
          >
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
    </nav>
  );
}
