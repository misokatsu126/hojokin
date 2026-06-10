"use client";

import { useState } from "react";
import Link from "next/link";
import type { NlSearchResponse } from "@/lib/types";
import { ScoreBadge } from "./Badges";

// 優先度ラベル（S/A/B/C/D）の色
function priorityTone(rank: string): string {
  switch (rank) {
    case "S": return "bg-rose-600 text-white";
    case "A": return "bg-green-600 text-white";
    case "B": return "bg-amber-500 text-white";
    case "C": return "bg-slate-400 text-white";
    default: return "bg-gray-200 text-gray-500";
  }
}

const EXAMPLES = [
  "ECサイトを作りたい",
  "新規事業を始めたい",
  "空調を入れ替えたい",
  "広告宣伝に使いたい",
  "人を採用したい",
  "店舗を改装したい",
  "AIを導入したい",
];

export function NlSearchBox({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<NlSearchResponse | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [ingestingUrl, setIngestingUrl] = useState(false);

  // 関連しそうな既知URLを取り込む（取り込み後に同じ相談文で再検索）
  async function ingestSuggested(url: string) {
    setIngestingUrl(true);
    try {
      const r = await fetch("/api/discovery/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error ?? "取り込みに失敗しました");
      await run(query); // 取り込み後に再検索して候補に反映
    } catch (e: any) {
      alert(`取り込みに失敗しました：${e.message}（このページは自動で読み取れない場合があります）`);
    } finally {
      setIngestingUrl(false);
    }
  }

  async function extract(discoveredItemId: string) {
    setExtracting(discoveredItemId);
    try {
      const r = await fetch("/api/discovery/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discovered_item_id: discoveredItemId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "抽出に失敗しました");
      alert(`AI抽出しました（${d.engine === "ai" ? "AI" : "ルールベース"}）。「自動探索 → 整理済み候補」で確認・管理対象に登録できます。`);
    } catch (e: any) {
      alert(`抽出に失敗しました：${e.message}`);
    } finally {
      setExtracting(null);
    }
  }

  async function run(q?: string) {
    const text = (q ?? query).trim();
    if (!text) return;
    setQuery(text);
    setLoading(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch("/api/search-nl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? `検索エラー (${r.status})`);
      }
      setRes((await r.json()) as NlSearchResponse);
    } catch (e: any) {
      setError(e.message ?? "検索に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="例：ECサイトを作りたい / 新規事業を始めたい / 空調を入れ替えたい"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          onClick={() => run()}
          disabled={loading}
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "探しています…" : "使える可能性を探す"}
        </button>
      </div>

      {!compact && !res && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => run(ex)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 hover:border-accent hover:text-accent"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {res && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">{res.summary}</span>
            <span className="text-xs text-gray-400">{res.engine === "ai" ? "AI抽出" : "ルール抽出"}</span>
          </div>

          {res.ingested && (
            <p className={`mb-2 rounded-md border p-2 text-xs ${res.ingested.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
              {res.ingested.ok
                ? `URLを取り込みました：「${res.ingested.title ?? "（無題）"}」（${res.ingested.inserted ? "新規" : "更新"}）。下の「見つかった補助金」に表示しています。`
                : `URLの取り込みに失敗しました：${res.ingested.error ?? "不明"}`}
            </p>
          )}

          <InterpretedView res={res} />

          {res.why && res.results.length > 0 && (
            <p className="mb-2 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800">
              <span className="font-medium">なぜ出たか：</span>{res.why}
            </p>
          )}

          {res.relaxed_search_suggestions.length > 0 && (
            <p className="mb-2 text-xs text-amber-700">
              {res.relaxed_search_suggestions.join(" ")}
            </p>
          )}

          {res.results.length > 0 && (
            <h4 className="mb-1.5 text-sm font-semibold text-ink">この相談に近い補助金・助成金</h4>
          )}
          <div className="space-y-2">
            {res.results.map((item) => (
              <div key={item.grant_id} className="rounded-lg border bg-white p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {item.priority && (
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${priorityTone(item.priority)}`}>{item.priority}</span>
                    )}
                    <Link href={`/grants/${item.grant_id}`} className="truncate font-semibold text-ink hover:text-accent hover:underline">
                      {item.grant_name}
                    </Link>
                  </span>
                  <ScoreBadge score={item.match_score} recommendation={item.recommendation} />
                </div>
                {item.why && (
                  <p className="text-xs text-gray-600"><span className="text-gray-400">理由：</span>{item.why}</p>
                )}
                {item.possible_uses.length > 0 && (
                  <p className="text-xs text-gray-500">使えそうな用途：{item.possible_uses.slice(0, 3).join("、")}</p>
                )}
                {item.concerns.length > 0 && (
                  <p className="text-xs text-red-500">注意点：{item.concerns[0]}</p>
                )}
                {item.next_actions.length > 0 && (
                  <p className="mt-0.5 text-xs text-orange-700">次にやること：{item.next_actions.slice(0, 3).join(" → ")}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <Link href={`/grants/${item.grant_id}`} className="text-accent hover:underline">
                    詳細・事業別判定を見る →
                  </Link>
                  {item.official_url && (
                    <a href={item.official_url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 hover:underline">
                      公式ページを見る ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {res.suggested_url && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1 text-xs font-medium text-amber-800">関連しそうな公的ページがあります</p>
              <p className="mb-2 text-xs text-amber-700">{res.suggested_url.label}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => ingestSuggested(res.suggested_url!.url)} disabled={ingestingUrl} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                  {ingestingUrl ? "取り込み中…" : "このURLを取り込む"}
                </button>
                <a href={res.suggested_url.url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-800 underline">ページを開く ↗</a>
              </div>
            </div>
          )}

          {res.follow_up_questions && res.follow_up_questions.length > 0 && (
            <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3">
              <p className="mb-1 text-xs font-medium text-sky-800">より正確に探すために、次の情報があると精度が上がります：</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-sky-700">
                {res.follow_up_questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}

          {res.discovered_results && res.discovered_results.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 text-sm font-semibold text-ink">見つかった補助金（未確認・要確認）</h4>
              <div className="space-y-2">
                {res.discovered_results.map((d) => (
                  <div key={d.id} className="rounded-lg border bg-white p-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{d.title}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {d.external_source === "jnet21" && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-800">J-Net21</span>}
                        {d.external_source === "mirasapo" && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-800">ミラサポplus</span>}
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800">{d.status === "unreviewed" ? "未確認" : d.status}</span>
                        {d.match_score != null && d.match_score > 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800">相性{d.match_score}</span>}
                      </span>
                    </div>
                    {d.match_profile && <p className="text-xs text-gray-500">相性の良い事業：{d.match_profile}</p>}
                    <p className="text-[11px] text-gray-400">
                      {d.external_source === "jnet21" ? "出典：J-Net21" : d.external_source === "mirasapo" ? "出典：ミラサポplus" : d.external_source ? `出典：${d.external_source}` : ""}
                      {d.fetched_at ? `　取得：${new Date(d.fetched_at).toLocaleDateString("ja-JP")}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {(d.official_url || d.url) && (
                        <a href={d.official_url ?? d.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:opacity-90">公式ページを見る ↗</a>
                      )}
                      <button onClick={() => extract(d.id)} disabled={extracting === d.id} className="rounded border px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                        {extracting === d.id ? "抽出中…" : "内容を整理する"}
                      </button>
                      <Link href="/discovery/items" className="rounded border px-2 py-1 text-gray-600 hover:bg-gray-50">候補一覧で確認・管理対象に登録</Link>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-amber-700">※ 見つかった補助金は未確認の情報です。必ず「公式ページを見る」で公式ページを確認してください。</p>
            </div>
          )}

          <p className="mt-3 text-xs text-gray-400">
            ※ 登録済みデータに対する一次判定です。申請可否・受給を保証するものではありません。
          </p>
        </div>
      )}
    </div>
  );
}

function InterpretedView({ res }: { res: NlSearchResponse }) {
  const c = res.interpreted_conditions;
  const chips: string[] = [
    ...c.regions,
    ...c.industries,
    ...c.business_types,
    ...c.purposes,
    ...c.eligible_expenses,
  ];
  if (c.min_grant_amount) chips.push(`上限${(c.min_grant_amount / 10000).toLocaleString()}万円以上`);
  if (c.status) chips.push(c.status);
  if (chips.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-400">読み取った条件：</span>
      {chips.map((x, i) => (
        <span key={i} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {x}
        </span>
      ))}
    </div>
  );
}
