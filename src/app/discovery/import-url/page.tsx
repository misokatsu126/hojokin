"use client";

import { useState } from "react";
import Link from "next/link";
import { DiscoveryNav } from "@/components/DiscoveryNav";
import { HelpBox } from "@/components/DiscoveryHelp";

type ImportResult = {
  ok: boolean;
  inserted?: boolean;
  discovered_item_id?: string | null;
  title?: string | null;
  source_url?: string | null;
  official_url?: string | null;
  external_source?: string | null;
  match_score?: number | null;
  match_profile?: string | null;
  error?: string;
  reason?: string;
};

const REASON_LABEL: Record<string, string> = {
  http_failed: "ページ取得に失敗（接続不可・404など）",
  forbidden: "アクセス拒否（robots/403・IP/UA制限の可能性）",
  timeout: "タイムアウト（応答が遅い）",
  js_rendered: "本文がJavaScript描画の可能性（静的HTMLから取得できず）",
  save_failed: "保存に失敗（DB未設定の可能性）",
  bad_request: "URL形式が不正",
};

export default function ImportUrlPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ImportResult | null>(null);

  async function run() {
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
      setRes((await r.json()) as ImportResult);
    } catch (e: any) {
      setRes({ ok: false, error: e.message ?? "取り込みに失敗しました" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <DiscoveryNav />
      <HelpBox title="URLから追加">
        J-Net21の記事URLや自治体の補助金ページURLを貼って「取り込む」を押すと、ページを読み取って補助金候補として登録します。
        例：<span className="break-all">https://j-net21.smrj.go.jp/snavi2/articles/179830</span>
      </HelpBox>

      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="https://..."
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button onClick={run} disabled={busy} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "取り込み中…" : "URLから追加"}
          </button>
        </div>

        {res && (
          <div className="mt-4">
            {res.ok ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-800">
                  取り込み{res.inserted ? "（新規）" : "（更新）"}しました：{res.title ?? "（無題）"}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-900">
                  {res.external_source && <span>出典：{res.external_source === "jnet21" ? "J-Net21" : res.external_source}</span>}
                  {res.match_score != null && res.match_score > 0 && <span>相性スコア：{res.match_score}{res.match_profile ? `（${res.match_profile}）` : ""}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {(res.official_url || res.source_url) && (
                    <a href={res.official_url ?? res.source_url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded bg-emerald-600 px-3 py-1.5 font-medium text-white hover:opacity-90">公式ページを見る ↗</a>
                  )}
                  <Link href="/discovery/items" className="rounded border px-3 py-1.5 text-gray-700 hover:bg-white">見つかった補助金を見る</Link>
                  <Link href="/discovery/review" className="rounded border px-3 py-1.5 text-gray-700 hover:bg-white">AI抽出・管理対象に登録へ</Link>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">取り込みに失敗しました</p>
                <p className="mt-1">{res.error}</p>
                {res.reason && <p className="mt-1 text-xs">種別：{REASON_LABEL[res.reason] ?? res.reason}</p>}
                <p className="mt-1 text-xs text-red-500">※ 取得できないページ（ログイン必須・JS描画・アクセス制限）もあります。その場合は候補一覧で本文を貼り付けてから抽出してください。</p>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        取り込んだ候補は <Link href="/discovery/items" className="text-accent hover:underline">候補一覧</Link> に並び、自然文検索（トップ／AI検索）でも見つかります。
      </p>
    </div>
  );
}
