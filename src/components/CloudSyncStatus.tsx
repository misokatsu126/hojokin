"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase";
import { loadProjects, syncProjectsFromSupabase, deleteAllProjects } from "@/lib/projects";

// 案件のクラウド保存（Supabase）の状態表示。非エンジニアが「同期できているか」を確認できる。
export function CloudSyncStatus() {
  const [count, setCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

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

  const onReset = async () => {
    const n = loadProjects().length;
    if (n === 0) { setResetMsg("削除する補助金チェックはありません。"); return; }
    const cloudWarn = supabaseConfigured ? "\n（クラウド保存も削除します。共有している場合は他の端末からも消えます）" : "";
    if (!window.confirm(`登録した補助金チェック ${n} 件をすべて削除して初期状態に戻します。元に戻せません。よろしいですか？${cloudWarn}`)) return;
    if (!window.confirm("本当に削除しますか？（最終確認）")) return;
    setResetting(true);
    setResetMsg(null);
    try {
      const r = await deleteAllProjects();
      setCount(0);
      setResetMsg(`初期状態に戻しました（${r.removed}件を削除${r.cloudFailed > 0 ? `／クラウド削除に失敗 ${r.cloudFailed}件` : ""}）。`);
    } catch (e: any) {
      setResetMsg(`初期化エラー：${e?.message ?? e}`);
    } finally {
      setResetting(false);
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
      {/* 初期状態に戻す（お試し・デモ用） */}
      <div className="mt-3 border-t border-black/5 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">登録した補助金チェックをすべて消して、初期状態（最初の画面）に戻します。</p>
          <button onClick={onReset} disabled={resetting} className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
            {resetting ? "初期化中…" : "初期状態に戻す"}
          </button>
        </div>
        {resetMsg && <p className="mt-1 text-xs text-gray-700">{resetMsg}</p>}
      </div>
    </div>
  );
}
