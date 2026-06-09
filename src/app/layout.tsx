import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { LEGAL_DISCLAIMER_TEXT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "補助金・助成金レーダー",
  description: "複数事業向けの補助金・助成金レーダー兼管理台帳（MVP）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href="/" className="text-lg font-bold text-accent">
              補助金<span className="text-ink">レーダー</span>
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              <NavLink href="/" label="ダッシュボード" />
              <NavLink href="/grants" label="補助金一覧・検索" />
              <NavLink href="/search" label="AI検索" />
              <NavLink href="/profiles" label="事業プロフィール" />
              <NavLink href="/admin" label="補助金登録" />
              <NavLink href="/discovery" label="自動探索" />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            {LEGAL_DISCLAIMER_TEXT}
          </p>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-ink"
    >
      {label}
    </Link>
  );
}
