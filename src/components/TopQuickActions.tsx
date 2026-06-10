"use client";

import { useState } from "react";
import Link from "next/link";

export function TopQuickActions() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; title?: string | null; official_url?: string | null; source_url?: string | null; match_score?: number | null; error?: string } | null>(null);

  async function add() {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/discovery/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      setRes(await r.json());
    } catch (e: any) {
      setRes({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      {/* URLから追加 */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">URLから補助金を追加</h2>
        <p className="mb-2 text-xs text-gray-500">J-Net21や自治体ページのURLを貼るだけで候補に追加できます。</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="https://j-net21.smrj.go.jp/snavi2/articles/..."
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button onClick={add} disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "追加中…" : "URLから追加"}
          </button>
        </div>
        {res && (
          <div className={`mt-2 rounded-md border p-2 text-xs ${res.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {res.ok ? (
              <span>
                追加しました：{res.title ?? "（無題）"}
                {res.match_score != null && res.match_score > 0 ? `（相性${res.match_score}）` : ""}
                {(res.official_url || res.source_url) && (
                  <a href={res.official_url ?? res.source_url ?? "#"} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 underline">公式ページを見る↗</a>
                )}
                {" ／ "}
                <Link href="/discovery/items" className="font-medium text-emerald-700 underline">見つかった補助金を見る</Link>
              </span>
            ) : (
              <span>追加できませんでした：{res.error ?? "不明"}（取得できないページもあります）</span>
            )}
          </div>
        )}
      </div>

      {/* はじめての方へ */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">はじめての方へ</h2>
        <ol className="mb-2 space-y-0.5 text-xs text-gray-600">
          <li>① <Link href="/setup" className="text-accent hover:underline">事業プロフィールを登録</Link></li>
          <li>② <Link href="/discovery/sources" className="text-accent hover:underline">補助金を自動収集</Link>（情報源を登録して「今すぐ全収集」）</li>
          <li>③ 気になる候補は「公式ページを見る」で確認</li>
          <li>④ 使えそうなら「申請候補」にする</li>
          <li>⑤ <Link href="/reports" className="text-accent hover:underline">お客様向けレポート</Link>を作る</li>
        </ol>
        <Link href="/guide" className="inline-block rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">使い方ガイドを見る →</Link>
      </div>
    </div>
  );
}
