"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "ホーム", icon: "🏠", match: (p: string) => p === "/" },
  { href: "/search", label: "相談して探す", icon: "💬", match: (p: string) => p.startsWith("/search") },
  { href: "/discovery/items?view=applicant", label: "申請候補", icon: "📝", match: () => false },
  { href: "/calendar", label: "締切カレンダー", icon: "🗓", match: (p: string) => p.startsWith("/calendar") },
  { href: "/new-and-standard", label: "新着・定番", icon: "🆕", match: (p: string) => p.startsWith("/new-and-standard") },
  { href: "/settings", label: "設定", icon: "⚙️", match: (p: string) => p.startsWith("/settings") || p.startsWith("/profiles") || p.startsWith("/setup") || p.startsWith("/guide") || p.startsWith("/reports") },
  { href: "/discovery", label: "管理者画面", icon: "🛠", match: (p: string) => p === "/discovery" || p.startsWith("/discovery/") || p.startsWith("/admin") || p.startsWith("/grants") },
];

export function NavBar() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="-mx-1 flex gap-0.5 overflow-x-auto text-sm sm:mx-0 sm:flex-wrap sm:gap-1">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 transition sm:px-3 ${
              active ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100 hover:text-ink"
            }`}
          >
            <span aria-hidden>{l.icon}</span>
            <span>{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
