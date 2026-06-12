"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase";
import { loadProjects, syncProjectsFromSupabase } from "@/lib/projects";

// 案件のクラウド保存（Supabase）の状態表示。非エンジニアが「同期できているか」を確認できる。
export function CloudSyncStatus() {
  const [count, setCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => setCount(loadProjects().length);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("projects-changed", onChange);
    return () => window.removeEventListener("projects-changed", onChange);
  }, []);

  const onSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const list = await syncProjectsFromSupabase();
      setCount(list.length);
    } catch (e: any) {
      setError(e?.message ?? "同期に失敗しました");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={`mb-6 rounded-lg border p-4 ${supabaseConfigured ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {supabaseConfigured ? "☁ クラウド保存：有効" : "📴 クラウド保存：未設定（この端末にのみ保存）"}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {supabaseConfigured
              ? "案件はクラウドに保存され、別の端末・スタッフとも共有されます。"
              : "今はこの端末のブラウザにのみ保存されています。共有するには Supabase の設定が必要です。"}
            {count != null && <>（保存済みの案件：{count}件）</>}
          </p>
        </div>
        {supabaseConfigured && (
          <button onClick={onSync} disabled={syncing} className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50">
            {syncing ? "同期中…" : "今すぐ同期"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">同期エラー：{error}（テーブル未作成の場合は spending_projects_schema.sql を実行してください）</p>}
      {!supabaseConfigured && (
        <p className="mt-2 text-[11px] text-amber-700">
          .env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定し、supabase/spending_projects_schema.sql を実行すると共有保存が有効になります。
        </p>
      )}
    </div>
  );
}
