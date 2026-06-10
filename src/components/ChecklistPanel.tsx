"use client";

import { useEffect, useState } from "react";
import {
  fetchChecklistByDiscovered,
  upsertChecklist,
  fetchChecklistByGrant,
  upsertChecklistByGrant,
} from "@/lib/supabase";
import type { ApplicationChecklist, DiscoveredItem } from "@/lib/types";
import { CHECKLIST_ITEMS, CHECKLIST_STATUSES, type ChecklistKey, type ChecklistStatus } from "@/lib/constants";

// 申請前の公式確認チェックリスト。discovered_item か grant のどちらかに紐づけて使う。
//   後方互換：item（DiscoveredItem）を渡すと従来どおり discovered_item 用。
export function ChecklistPanel({
  item,
  discoveredItemId,
  grantId,
  officialUrl,
  sourceUrl,
}: {
  item?: DiscoveredItem;
  discoveredItemId?: string;
  grantId?: string;
  officialUrl?: string | null;
  sourceUrl?: string | null;
}) {
  const did = discoveredItemId ?? item?.id;
  const official = officialUrl ?? item?.official_url ?? null;
  const src = sourceUrl ?? item?.url ?? null;

  const [cl, setCl] = useState<ApplicationChecklist | null>(null);
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function read(): Promise<ApplicationChecklist | null> {
    if (grantId) return fetchChecklistByGrant(grantId);
    if (did) return fetchChecklistByDiscovered(did);
    return null;
  }
  async function write(p: Partial<ApplicationChecklist>): Promise<ApplicationChecklist> {
    if (grantId) return upsertChecklistByGrant(grantId, p);
    return upsertChecklist(did as string, p);
  }

  useEffect(() => {
    read()
      .then((c) => { setCl(c); setMemo(c?.memo ?? ""); })
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, grantId]);

  async function patch(p: Partial<ApplicationChecklist>) {
    setSaving(true);
    setError(null);
    try {
      const saved = await write(p);
      setCl(saved);
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
    } catch (e: any) {
      setError(e.message ?? "保存に失敗しました（discovery_phase2_schema.sql 未実行の可能性）");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="px-1 py-2 text-xs text-gray-400">チェックリスト読み込み中…</p>;

  const checkedCount = CHECKLIST_ITEMS.filter((it) => cl?.[it.key as ChecklistKey]).length;
  const incomplete = checkedCount < CHECKLIST_ITEMS.length;
  const status = (cl?.status ?? "未確認") as ChecklistStatus;

  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">公式ページ確認チェックリスト（{checkedCount}/{CHECKLIST_ITEMS.length}）</span>
        <span className="flex items-center gap-2">
          {(official || src) && (
            <a href={official ?? src ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90">公式ページを見る ↗</a>
          )}
          <select value={status} onChange={(e) => patch({ status: e.target.value as ChecklistStatus })} className="rounded-md border px-2 py-0.5 text-xs">
            {CHECKLIST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </span>
      </div>

      {incomplete && (status === "申請候補" || status === "申請準備中") && (
        <p className="mb-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          ⚠ 未確認の項目が {CHECKLIST_ITEMS.length - checkedCount} 件あります。申請前にすべて確認してください。
        </p>
      )}

      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {CHECKLIST_ITEMS.map((it) => {
          const key = it.key as ChecklistKey;
          const val = Boolean(cl?.[key]);
          return (
            <label key={key} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${val ? "bg-green-50 text-green-900" : "text-gray-700 hover:bg-white"}`}>
              <input type="checkbox" checked={val} onChange={(e) => patch({ [key]: e.target.checked } as Partial<ApplicationChecklist>)} className="h-3.5 w-3.5" />
              {it.label}
            </label>
          );
        })}
      </div>

      <div className="mt-2">
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => { if (memo !== (cl?.memo ?? "")) patch({ memo: memo || null }); }}
          rows={2}
          placeholder="メモ（確認結果・問い合わせ内容など）"
          className="w-full rounded-md border px-2 py-1 text-xs"
        />
      </div>

      <div className="mt-1 text-[10px] text-gray-400">
        {saving ? "保存中…" : savedAt ? `保存しました（${savedAt}）` : "変更は自動保存されます"}
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </div>
    </div>
  );
}
