import Link from "next/link";
import { CloudSyncStatus } from "@/components/CloudSyncStatus";

const GROUPS = [
  {
    title: "データ管理",
    links: [
      { href: "/profiles", label: "事業プロフィール", desc: "自社・お客様の事業を登録・編集" },
      { href: "/setup", label: "かんたん初期設定", desc: "はじめての事業登録ウィザード" },
      { href: "/admin", label: "補助金の登録・管理", desc: "正式リストの補助金を手動で追加・編集" },
      { href: "/grants", label: "補助金一覧・検索", desc: "登録済み補助金の一覧とフィルター" },
    ],
  },
  {
    title: "補助金を探す",
    links: [
      { href: "/discovery", label: "自動収集の状況（管理者向け）", desc: "新着・確認待ち・公式未確認などの状況" },
      { href: "/discovery/sources", label: "情報源と収集", desc: "情報源の登録・今すぐ全収集" },
      { href: "/settings/collect", label: "収集する補助金の条件", desc: "収集キーワード・対象地域の設定" },
      { href: "/discovery/items", label: "候補になった補助金・助成金", desc: "収集された候補の確認・整理" },
      { href: "/discovery/import-url", label: "URLから追加", desc: "記事URLから候補を取り込む" },
      { href: "/search", label: "相談して探す", desc: "やりたいことから横断検索" },
    ],
  },
  {
    title: "お知らせ・ガイド",
    links: [
      { href: "/reminders", label: "通知・リマインド", desc: "発注前・締切など、支出ごとの確認リマインド" },
      { href: "/notifications", label: "お知らせ候補（管理者向け）", desc: "自動収集で見つかった合いそうな補助金" },
      { href: "/guide", label: "使い方ガイド", desc: "5ステップの使い方" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-ink">設定・メニュー</h1>
      <CloudSyncStatus />
      <div className="space-y-6">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h2 className="mb-2 text-sm font-semibold text-gray-600">{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-lg border bg-white p-3 transition hover:border-accent">
                  <div className="text-sm font-semibold text-ink">{l.label}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{l.desc}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
