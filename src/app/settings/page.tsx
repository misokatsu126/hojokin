import Link from "next/link";

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
      { href: "/discovery", label: "補助金を探す（探索ホーム）", desc: "自動収集の状況・横断検索" },
      { href: "/discovery/sources", label: "情報源と収集", desc: "情報源の登録・今すぐ全収集" },
      { href: "/discovery/items", label: "見つかった補助金", desc: "収集された候補の確認・整理" },
      { href: "/discovery/import-url", label: "URLから追加", desc: "記事URLから候補を取り込む" },
      { href: "/search", label: "AI検索", desc: "自然文で横断検索" },
    ],
  },
  {
    title: "お知らせ・ガイド",
    links: [
      { href: "/notifications", label: "お知らせ候補", desc: "高相性・締切間近などの通知候補" },
      { href: "/guide", label: "使い方ガイド", desc: "5ステップの使い方" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-ink">設定・メニュー</h1>
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
