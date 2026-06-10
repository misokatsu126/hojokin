import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { LEGAL_DISCLAIMER_TEXT } from "@/lib/constants";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "補助金ナビ｜使える可能性を探す",
  description: "事業情報から、使える可能性がある補助金・助成金を自動で探して案内するツール",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="sticky top-0 z-30 border-b bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">補</span>
              <span className="hidden text-base font-bold text-ink sm:inline">補助金<span className="text-accent">ナビ</span></span>
            </Link>
            <div className="min-w-0 flex-1">
              <NavBar />
            </div>
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
