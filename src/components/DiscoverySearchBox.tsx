"use client";

import { useState } from "react";
import Link from "next/link";

type UnifiedResult = {
  source: "grant" | "discovered" | "candidate";
  id: string;
  name: string;
  state: string;
  state_tone: "green" | "sky" | "orange" | "indigo" | "purple" | "gray";
  official_url: string | null;
  detail_href: string;
  score: number;
  warnings: string[];
};

const TONE: Record<UnifiedResult["state_tone"], string> = {
  green: "bg-green-100 text-green-800",
  sky: "bg-sky-100 text-sky-800",
  orange: "bg-orange-100 text-orange-800",
  indigo: "bg-indigo-100 text-indigo-800",
  purple: "bg-purple-100 text-purple-700",
  gray: "bg-gray-100 text-gray-600",
};

export function DiscoverySearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedResult[] | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/discovery/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "検索に失敗しました");
      setResults(data.results as UnifiedResult[]);
      setEngine(data.engine);
    } catch (e: any) {
      setError(e.message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">横断 自然文検索（正式・検知候補・AI抽出を横断）</h2>
        {engine && <span className="text-xs text-gray-400">{engine === "ai" ? "AI解釈" : "ルール解釈"}</span>}
      </div>
      <p className="mb-2 text-xs text-gray-400">
        例：「名古屋の小売店で使える店舗改装の補助金」。grants（正式登録済み）に加え、未確認候補・AI抽出候補も状態付きで横断検索します。
      </p>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="自然文で検索"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button onClick={run} disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "検索中…" : "検索"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {results && (
        <div className="mt-3">
          {results.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-gray-400">該当する候補は見つかりませんでした。</p>
          ) : (
            <ul className="space-y-1.5">
              {results.map((r) => (
                <li key={`${r.source}-${r.id}`} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={r.detail_href} className="min-w-0 truncate text-sm text-ink hover:text-accent hover:underline">
                      {r.name}
                    </Link>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[r.state_tone]}`}>
                      {r.state}
                    </span>
                  </div>
                  {r.warnings.length > 0 && (
                    <p className="mt-1 text-xs text-orange-700">⚠ {r.warnings[0]}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-gray-400">
            「未確認候補」「公式未確認」「AI抽出済み（公式未確認）」「過年度候補」「重複候補」は申請判断に使わず、必ず公式情報で確認してください。
          </p>
        </div>
      )}
    </div>
  );
}
