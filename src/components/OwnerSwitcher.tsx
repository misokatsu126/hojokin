"use client";

import { useEffect, useState } from "react";
import { getOwner, setOwner, knownOwners } from "@/lib/projects";

// 利用者ID方式：このブラウザの「使用者」を選ぶ／切り替える簡易マルチユーザー。
//   ※ パスワード無しの簡易方式（社内の信頼ベース）。選んだ人の補助金チェックだけ表示する。
export function OwnerSwitcher({ compact = false }: { compact?: boolean }) {
  const [owner, setOwnerState] = useState("");
  const [known, setKnown] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const refresh = () => { setOwnerState(getOwner()); setKnown(knownOwners()); };
  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener("owner-changed", on);
    window.addEventListener("projects-changed", on);
    return () => { window.removeEventListener("owner-changed", on); window.removeEventListener("projects-changed", on); };
  }, []);

  const apply = (name: string) => {
    const n = name.trim();
    if (!n) return;
    setOwner(n);
    setEditing(false);
    setValue("");
  };

  // 未設定 or 編集中の入力欄
  const editor = (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        value={value} onChange={(e) => setValue(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") apply(value); if (e.key === "Escape") setEditing(false); }}
        placeholder="あなたの名前（例：佐藤）" className="min-w-0 rounded-md border px-2.5 py-1.5 text-sm"
      />
      <button onClick={() => apply(value)} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">決定</button>
      {owner && <button onClick={() => setEditing(false)} className="rounded-md border px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50">やめる</button>}
      {known.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          {known.map((k) => (
            <button key={k} onClick={() => apply(k)} className="rounded-full border px-2.5 py-1 text-[11px] text-gray-600 hover:border-accent">{k}</button>
          ))}
        </span>
      )}
    </div>
  );

  if (compact) {
    // ホーム上部の小さな表示
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs">
        <span className="text-gray-500">👤 利用者：</span>
        {editing || !owner ? editor : (
          <>
            <span className="font-semibold text-ink">{owner}</span>
            <button onClick={() => { setEditing(true); setValue(""); }} className="text-accent hover:underline">切り替え</button>
            <span className="text-gray-400">（自分の補助金チェックだけ表示しています）</span>
          </>
        )}
      </div>
    );
  }

  // 設定ページ用
  return (
    <div className="mb-6 rounded-lg border bg-white p-4">
      <p className="text-sm font-semibold text-ink">👤 利用者（このブラウザの使用者）</p>
      <p className="mt-0.5 mb-2 text-xs text-gray-600">
        名前を選ぶと、その人の補助金チェックだけが表示されます。A・B・Cさんで分けて使えます。
        <span className="text-gray-400">（パスワードは無い簡易方式です。社内での利用を想定）</span>
      </p>
      {editing || !owner ? editor : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>現在：<span className="font-semibold text-ink">{owner}</span></span>
          <button onClick={() => { setEditing(true); setValue(""); }} className="rounded-md border px-3 py-1.5 text-xs text-accent hover:bg-accent/5">利用者を切り替える</button>
        </div>
      )}
    </div>
  );
}
