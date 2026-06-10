"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCollectSettings, saveCollectSettings } from "@/lib/supabase";
import { CommaField } from "@/components/Form";

const DEFAULT_KEYWORDS = ["補助金", "助成金", "IT", "DX", "省エネ", "創業", "販路", "設備"];
const DEFAULT_REGIONS = ["愛知県", "名古屋市", "弥富市", "岐阜県", "岐阜市", "三重県", "四日市市"];

export default function CollectSettingsPage() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingDefault, setUsingDefault] = useState(false);

  useEffect(() => {
    fetchCollectSettings()
      .then((s) => {
        if (s && (s.keywords.length || s.regions.length)) {
          setKeywords(s.keywords);
          setRegions(s.regions);
        } else {
          setKeywords(DEFAULT_KEYWORDS);
          setRegions(DEFAULT_REGIONS);
          setUsingDefault(true);
        }
      })
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await saveCollectSettings(keywords, regions);
      setUsingDefault(false);
      setMsg("保存しました。次回の収集（Jグランツ同期／全収集／毎朝のCron）から反映されます。");
    } catch (e: any) {
      setError(e.message ?? "保存に失敗しました（discovery_collect_settings_schema.sql 未実行の可能性）");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 text-xs text-gray-400"><Link href="/settings" className="hover:underline">設定</Link> ／ 収集の対象</div>
      <h1 className="mb-2 text-xl font-bold text-ink">収集する補助金の条件</h1>
      <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
        国のデータベース（Jグランツ）から自動収集するときの「キーワード」と「対象地域」を設定します。ここを変えると、次回の収集から反映されます。
        {usingDefault && <span className="block text-xs text-sky-700">※ 現在は初期設定の値です。</span>}
      </p>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {msg && <p className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</p>}

      <div className="space-y-4 rounded-lg border bg-white p-5">
        <div>
          <CommaField label="キーワード（、または , 区切り）" value={keywords} onChange={setKeywords} placeholder="補助金、IT、省エネ" />
          <p className="mt-1 text-xs text-gray-400">例：補助金 / 助成金 / IT / DX / 省エネ / 創業 / 販路 / 設備</p>
        </div>
        <div>
          <CommaField label="対象地域（、または , 区切り）" value={regions} onChange={setRegions} placeholder="愛知県、名古屋市、岐阜県" />
          <p className="mt-1 text-xs text-gray-400">都道府県名・市区町村名で指定。全国の制度は常に含まれます。</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{busy ? "保存中…" : "保存する"}</button>
          <button onClick={() => { setKeywords(DEFAULT_KEYWORDS); setRegions(DEFAULT_REGIONS); }} className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">初期値に戻す</button>
          <Link href="/discovery/sources" className="text-sm text-accent hover:underline">収集を実行する →</Link>
        </div>
      </div>
    </div>
  );
}
