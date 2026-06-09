"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/discovery", label: "探索ダッシュボード" },
  { href: "/discovery/sources", label: "情報源管理" },
  { href: "/discovery/items", label: "検知候補" },
  { href: "/discovery/review", label: "AI抽出候補" },
];

export function DiscoveryNav() {
  const pathname = usePathname();
  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap gap-1 rounded-lg border bg-white p-1 text-sm">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-md px-3 py-1.5 transition ${
                active ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
        補助金・助成金 自動探索レーダー（MVP）。信頼できる情報源を登録し、検知候補を
        「未確認候補」として保存 → AIで抽出 → 人が公式情報を確認 → 正式登録、の安全フローで運用します。
        民間まとめサイト等の二次情報は、必ず公式サイト・公募要領PDFで確認してから本登録してください。
      </p>
    </div>
  );
}
