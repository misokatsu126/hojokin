"use client";

import { useState } from "react";
import Link from "next/link";
import type { NlSearchResponse } from "@/lib/types";
import { ScoreBadge } from "./Badges";

const EXAMPLES = [
  "愛知県の小売店で、店舗改装に使える補助金は？",
  "名古屋市でECサイト改善に使える補助金を探して",
  "一般社団法人が健康イベントに使える助成金は？",
  "AI導入や業務自動化に使える補助金は？",
  "補助上限100万円以上で募集中の制度だけ出して",
];

export function NlSearchBox({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<NlSearchResponse | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);

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
      alert(`AI抽出しました（${d.engine === "ai" ? "AI" : "ルールベース"}）。「自動探索 → AI抽出候補」で確認・正式登録できます。`);
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
          placeholder="自然文で検索：例「空調設備に使える補助金は？」"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          onClick={() => run()}
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "検索中…" : "AI検索"}
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
                ? `URLを取り込みました：「${res.ingested.title ?? "（無題）"}」（${res.ingested.inserted ? "新規" : "更新"}）。下の「自動検知候補」に表示しています。`
                : `URLの取り込みに失敗しました：${res.ingested.error ?? "不明"}`}
            </p>
          )}

          <InterpretedView res={res} />

          {res.relaxed_search_suggestions.length > 0 && (
            <p className="mb-2 text-xs text-amber-700">
              {res.relaxed_search_suggestions.join(" ")}
            </p>
          )}

          <div className="space-y-2">
            {res.results.map((item) => (
              <div key={item.grant_id} className="rounded-lg border bg-white p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Link href={`/grants/${item.grant_id}`} className="font-semibold text-ink hover:text-accent hover:underline">
                    {item.grant_name}
                  </Link>
                  <ScoreBadge score={item.match_score} recommendation={item.recommendation} />
                </div>
                {item.matched_reasons.length > 0 && (
                  <p className="text-xs text-gray-500">該当理由：{item.matched_reasons.slice(0, 2).join(" / ")}</p>
                )}
                {item.possible_uses.length > 0 && (
                  <p className="text-xs text-gray-500">使えそうな用途：{item.possible_uses.slice(0, 3).join("、")}</p>
                )}
                {item.concerns.length > 0 && (
                  <p className="text-xs text-red-500">懸念点：{item.concerns[0]}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <Link href={`/grants/${item.grant_id}`} className="text-accent hover:underline">
                    詳細・事業別判定を見る →
                  </Link>
                  {item.official_url && (
                    <a href={item.official_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:underline">
                      公式サイト ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {res.discovered_results && res.discovered_results.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 text-sm font-semibold text-ink">自動検知候補（未確認・要確認）</h4>
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
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {(d.official_url || d.url) && (
                        <a href={d.official_url ?? d.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:opacity-90">本物を見る ↗</a>
                      )}
                      <button onClick={() => extract(d.id)} disabled={extracting === d.id} className="rounded border px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                        {extracting === d.id ? "抽出中…" : "AIで抽出する"}
                      </button>
                      <Link href="/discovery/items" className="rounded border px-2 py-1 text-gray-600 hover:bg-gray-50">候補一覧で確認・正式登録</Link>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-amber-700">※ 自動検知候補は未確認の情報です。必ず「本物を見る」で公式ページを確認してください。</p>
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
