"use client";

import type { SpendingProject } from "@/lib/projects";

// 補助金が見つかった「あと」の進め方を示す軽量ガイド。
//   申請の一般的な流れ（後払い・交付決定前発注NG）と、誰に相談するかの橋渡しまで。
//   ※ 申請代行・受給保証はしない。あくまで「進め方の地図」と相談先の案内。

const STEPS: { t: string; d: string; warn?: boolean }[] = [
  { t: "対象か確認する", d: "公式サイト・募集要項で、対象・条件・締切を確認します。", },
  { t: "必要書類をそろえる", d: "事業計画・見積書・GビズIDなど（制度により異なる）。", },
  { t: "申請する", d: "締切までに申請します（電子申請が多い）。", },
  { t: "交付決定を待つ", d: "ここまで発注・契約・支払いをしないでください。最重要ポイントです。", warn: true },
  { t: "発注・実施・支払い", d: "交付決定の通知が出てから、発注・実施・支払いを進めます。", },
  { t: "実績報告して入金", d: "実施後に報告し、あとから入金されます（補助金は後払い）。", },
];

function currentStep(project: SpendingProject): number {
  const c = project.checklist ?? {};
  const ordered = ["contract", "ordered", "paid"].includes(project.orderStatus);
  if (ordered) return 4; // すでに発注・支払い（本来は交付決定後）
  if (c["estimate"]) return 2; // 見積までそろった → 申請段階
  if (c["guideline"]) return 1; // 対象確認済み → 書類準備
  return 0;
}

export function ApplicationRoadmap({ project }: { project: SpendingProject }) {
  const cur = currentStep(project);
  const ordered = ["contract", "ordered", "paid"].includes(project.orderStatus);
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-lg font-bold text-ink">このあとの進め方</h2>
      <p className="mb-2 text-xs text-gray-500">補助金が使えそうなら、一般的にはこの流れで進みます（制度により異なります）。</p>

      {/* 初心者がいちばん事故る3点 */}
      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <p className="font-bold">最初に知っておくこと</p>
        <ul className="mt-1 space-y-0.5">
          <li>・補助金は<strong>後払い</strong>です（先に自費で払い、あとから入金）。</li>
          <li>・<strong>交付決定の前に発注・契約・支払いをすると対象外</strong>になることがあります。</li>
          <li>・申請しても<strong>採択されないこと</strong>もあります。資金計画は余裕をもって。</li>
        </ul>
      </div>

      <ol className="space-y-1.5">
        {STEPS.map((s, i) => {
          const done = i < cur;
          const here = i === cur;
          return (
            <li key={s.t} className={`flex items-start gap-3 rounded-lg border p-2.5 ${here ? "border-accent bg-accent/5" : s.warn ? "border-red-200 bg-red-50/40" : "bg-white"}`}>
              <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-green-500 text-white" : here ? "bg-accent text-white" : s.warn ? "bg-red-500 text-white" : "bg-gray-200 text-gray-600"}`}>
                {done ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">
                  {s.t}
                  {here && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-normal text-white">いまここ</span>}
                </span>
                <span className="mt-0.5 block text-xs text-gray-600">{s.d}</span>
                {s.warn && ordered && (
                  <span className="mt-1 block text-[11px] font-medium text-red-700">※ すでに発注・支払い済みの場合、交付決定の前だと対象外になることがあります。</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// 誰に相談する？ 地域の窓口を探すリンクまで橋渡しする。
export function ConsultRouting({ project }: { project: SpendingProject }) {
  const region = (project.location || project.store || "").trim();
  const q = (text: string) => `https://www.google.com/search?q=${encodeURIComponent(`${region ? region + " " : ""}${text}`)}`;
  const rows: { who: string; when: string; href: string; label: string }[] = [
    { who: "商工会議所・商工会", when: "持続化補助金など。事前相談・確認が必要なことが多い", href: q("商工会議所"), label: "近くの窓口を探す" },
    { who: "よろず支援拠点", when: "無料で何でも相談できる公的窓口。まず迷ったらここ", href: q("よろず支援拠点"), label: "近くの拠点を探す" },
    { who: "認定経営革新等支援機関", when: "ものづくり・事業再構築などの事業計画づくり", href: "https://www.google.com/search?q=" + encodeURIComponent("認定経営革新等支援機関 検索"), label: "支援機関を探す" },
    { who: "社労士・行政書士など", when: "雇用・賃上げ・許認可に関わる制度", href: q("社会保険労務士 補助金 助成金"), label: "専門家を探す" },
    { who: "自治体の産業振興課", when: "地域独自の補助金や事前相談", href: q("産業振興課 補助金"), label: "自治体に問い合わせる" },
  ];
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-lg font-bold text-ink">誰に相談する？</h2>
      <p className="mb-2 text-xs text-gray-500">
        自分で申請もできますが、はじめてなら相談がおすすめです。
        {region ? <>「{region}」の窓口を検索します。</> : "市区町村を入力すると、近くの窓口を探しやすくなります。"}
        上の「相談用メモを作る」で持っていくと話が早いです。
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.who} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{r.who}</p>
              <p className="mt-0.5 text-xs text-gray-500">{r.when}</p>
            </div>
            <a href={r.href} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">{r.label} ↗</a>
          </div>
        ))}
      </div>
    </section>
  );
}
