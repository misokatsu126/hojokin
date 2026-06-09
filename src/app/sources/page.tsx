"use client";

import { useEffect, useState } from "react";
import {
  fetchSourceSites,
  createSourceSite,
  updateSourceSite,
  deleteSourceSite,
} from "@/lib/supabase";
import type { SourceSite, SourceSiteInput } from "@/lib/types";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_LABEL,
  SOURCE_TYPE_TIER,
  SOURCE_TYPE_DEFAULT_TRUST,
  TRUST_LEVELS,
  TRUST_LEVEL_LABEL,
  SOURCE_PRIORITIES,
  SOURCE_PRIORITY_LABEL,
  CRAWL_FREQUENCIES,
  CRAWL_FREQUENCY_LABEL,
  type SourceType,
  type TrustLevel,
} from "@/lib/constants";
import { TextField, TextArea } from "@/components/Form";
import { TrustBadge, SourceTypeBadge } from "@/components/Badges";
import { RadarNav } from "@/components/RadarNav";
import { formatDate } from "@/lib/utils";
import { SAMPLE_SOURCE_SITES } from "@/lib/samples";

const blank: SourceSiteInput = {
  name: "",
  source_type: "official",
  trust_level: "A",
  url: "",
  region: "",
  priority: "medium",
  crawl_frequency: "weekly",
  is_active: true,
  last_checked_at: null,
  notes: "",
};

export default function SourcesPage() {
  const [sites, setSites] = useState<SourceSite[]>([]);
  const [form, setForm] = useState<SourceSiteInput>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setSites(await fetchSourceSites());
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof SourceSiteInput, v: any) => setForm((p) => ({ ...p, [k]: v }));

  // 情報源カテゴリを変えたら既定の信頼度を自動セット（手動で上書き可）
  function setSourceType(v: SourceType) {
    setForm((p) => ({ ...p, source_type: v, trust_level: SOURCE_TYPE_DEFAULT_TRUST[v] }));
  }

  function startNew() {
    setEditing(null);
    setForm(blank);
    setShowForm(true);
  }
  function startEdit(s: SourceSite) {
    setEditing(s.id);
    const { id, created_at, updated_at, ...rest } = s;
    setForm(rest);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!form.name.trim()) {
      alert("情報源名を入力してください。");
      return;
    }
    setBusy(true);
    try {
      if (editing) await updateSourceSite(editing, form);
      else await createSourceSite(form);
      setShowForm(false);
      setForm(blank);
      setEditing(null);
      await load();
    } catch (e: any) {
      alert(`保存に失敗しました: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: SourceSite) {
    try {
      await updateSourceSite(s.id, { is_active: !s.is_active });
      await load();
    } catch (e: any) {
      alert(`更新に失敗しました: ${e.message}`);
    }
  }

  async function remove(id: string) {
    if (!confirm("この情報源を削除しますか？関連する巡回ログも削除されます。")) return;
    try {
      await deleteSourceSite(id);
      await load();
    } catch (e: any) {
      alert(`削除に失敗しました: ${e.message}`);
    }
  }

  async function seedSamples() {
    if (!confirm("サンプル情報源8件（公式・準公式・民間まとめ・記事・ニュース）を登録しますか？")) return;
    setBusy(true);
    try {
      for (const s of SAMPLE_SOURCE_SITES) await createSourceSite(s);
      await load();
    } catch (e: any) {
      alert(`サンプル登録に失敗しました: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <RadarNav />
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}（radar_schema.sql を Supabase で実行済みか確認してください）
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">情報源管理（監視対象サイト）</h1>
        <div className="flex gap-2">
          {sites.length === 0 && (
            <button onClick={seedSamples} disabled={busy} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              サンプル8件を登録
            </button>
          )}
          <button onClick={startNew} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
            ＋ 情報源を追加
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">{editing ? "情報源を編集" : "新規情報源"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField label="情報源名" value={form.name} onChange={(v) => set("name", v)} required />
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">情報源カテゴリ（3層構造）</span>
              <select
                value={form.source_type}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-400">{SOURCE_TYPE_TIER[form.source_type]}</span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">信頼度（カテゴリに応じ自動設定・変更可）</span>
              <select
                value={form.trust_level}
                onChange={(e) => set("trust_level", e.target.value as TrustLevel)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                {TRUST_LEVELS.map((t) => (
                  <option key={t} value={t}>
                    {TRUST_LEVEL_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>

            <TextField label="URL" value={form.url ?? ""} onChange={(v) => set("url", v)} placeholder="https://" />
            <TextField label="対象地域（任意）" value={form.region ?? ""} onChange={(v) => set("region", v)} placeholder="例：全国 / 愛知県" />

            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">優先度</span>
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                {SOURCE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{SOURCE_PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">巡回頻度（将来の自動巡回用）</span>
              <select value={form.crawl_frequency} onChange={(e) => set("crawl_frequency", e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                {CRAWL_FREQUENCIES.map((c) => (
                  <option key={c} value={c}>{CRAWL_FREQUENCY_LABEL[c]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <TextArea label="メモ" value={form.notes ?? ""} onChange={(v) => set("notes", v)} rows={2} />
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="h-4 w-4" />
            アクティブ（巡回対象にする）
          </label>

          <p className="mt-3 text-xs text-gray-400">
            MVPでは実際の巡回は行いません。まずは「将来監視する情報源」を登録・管理できます。
          </p>

          <div className="mt-5 flex gap-2">
            <button onClick={save} disabled={busy} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "保存中…" : "保存"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {sites.length === 0 ? (
        <p className="rounded-lg border bg-white p-8 text-center text-gray-400">
          情報源がまだありません。「サンプル8件を登録」または「情報源を追加」から登録してください。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">情報源</th>
                <th className="px-3 py-2">カテゴリ</th>
                <th className="px-3 py-2">信頼度</th>
                <th className="px-3 py-2">優先度</th>
                <th className="px-3 py-2">巡回</th>
                <th className="px-3 py-2">最終巡回</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{s.name}</div>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-accent hover:underline" style={{ maxWidth: 220 }}>
                        {s.url}
                      </a>
                    )}
                    {s.region && <span className="text-xs text-gray-400">{s.region}</span>}
                  </td>
                  <td className="px-3 py-2"><SourceTypeBadge type={s.source_type} /></td>
                  <td className="px-3 py-2"><TrustBadge level={s.trust_level} /></td>
                  <td className="px-3 py-2 text-gray-500">{SOURCE_PRIORITY_LABEL[s.priority] ?? s.priority}</td>
                  <td className="px-3 py-2 text-gray-500">{CRAWL_FREQUENCY_LABEL[s.crawl_frequency] ?? s.crawl_frequency}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{s.last_checked_at ? formatDate(s.last_checked_at) : "未巡回"}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActive(s)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}
                    >
                      {s.is_active ? "アクティブ" : "停止中"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(s)} className="mr-3 text-accent hover:underline">編集</button>
                    <button onClick={() => remove(s.id)} className="text-red-500 hover:underline">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
