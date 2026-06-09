"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchDiscoveredItems,
  createDiscoveredItem,
  updateDiscoveredItem,
  deleteDiscoveredItem,
  fetchSourceSites,
  fetchGrants,
} from "@/lib/supabase";
import type { DiscoveredItem, DiscoveredItemInput, SourceSite, Grant } from "@/lib/types";
import {
  DETECTION_TYPES,
  DETECTION_TYPE_LABEL,
  SOURCE_TYPES,
  SOURCE_TYPE_LABEL,
  type SourceType,
} from "@/lib/constants";
import { TextField, TextArea } from "@/components/Form";
import {
  TrustBadge,
  SourceTypeBadge,
  DiscoveredStatusBadge,
  VerificationBadge,
  SecondarySourceWarning,
  OfficialUnconfirmedWarning,
} from "@/components/Badges";
import { RadarNav } from "@/components/RadarNav";
import { formatDate } from "@/lib/utils";
import { isSecondarySource, deriveTrustLevel, detectDuplicateFlags } from "@/lib/radar";
import { SAMPLE_DISCOVERED_ITEMS } from "@/lib/samples";

type AddForm = {
  source_site_id: string;
  title: string;
  url: string;
  source_category: SourceType;
  detection_type: DiscoveredItem["detection_type"];
  raw_text: string;
  pdf_url: string;
  official_url: string;
  official_pdf_url: string;
  official_source_confirmed: boolean;
};

const blank: AddForm = {
  source_site_id: "",
  title: "",
  url: "",
  source_category: "aggregator",
  detection_type: "new",
  raw_text: "",
  pdf_url: "",
  official_url: "",
  official_pdf_url: "",
  official_source_confirmed: false,
};

export default function DiscoveredPage() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [sites, setSites] = useState<SourceSite[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [form, setForm] = useState<AddForm>(blank);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [it, ss, gr] = await Promise.all([
      fetchDiscoveredItems(),
      fetchSourceSites(),
      fetchGrants(),
    ]);
    setItems(it);
    setSites(ss);
    setGrants(gr);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const set = (k: keyof AddForm, v: any) => setForm((p) => ({ ...p, [k]: v }));

  // 情報源を選ぶとカテゴリを引き継ぐ
  function selectSite(id: string) {
    const s = siteMap.get(id);
    setForm((p) => ({
      ...p,
      source_site_id: id,
      source_category: s ? s.source_type : p.source_category,
    }));
  }

  async function add() {
    if (!form.title.trim()) {
      alert("タイトルを入力してください。");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const trust = deriveTrustLevel(form.source_category);
      // 重複・過年度の簡易検知
      const existing = [
        ...grants.map((g) => ({ id: g.id, title: g.name, url: g.official_url })),
        ...items.map((i) => ({ id: i.id, title: i.title, url: i.official_url ?? i.url })),
      ];
      const { duplicateOfId, isOldYear } = detectDuplicateFlags(
        { title: form.title, official_url: form.official_url || null, url: form.url || null },
        existing
      );

      const payload: DiscoveredItemInput = {
        source_site_id: form.source_site_id || null,
        title: form.title.trim(),
        url: form.url || null,
        raw_text: form.raw_text || null,
        raw_html: null,
        pdf_url: form.pdf_url || null,
        detection_type: form.detection_type,
        status: "unreviewed",
        source_category: form.source_category,
        trust_level: trust,
        original_source_url: form.url || null,
        official_url: form.official_url || null,
        official_pdf_url: form.official_pdf_url || null,
        official_source_confirmed: form.official_source_confirmed,
        source_warning: isOldYear ? "過年度・募集終了の可能性（タイトルに年度表記）" : null,
        last_verified_at: null,
        verification_status: form.official_source_confirmed ? "official_found" : "unverified",
        duplicate_of: duplicateOfId,
      };
      await createDiscoveredItem(payload);
      setMsg(
        duplicateOfId
          ? "登録しました。既存と類似のため『重複候補』として記録しました。"
          : isOldYear
            ? "登録しました。年度表記を検知したため『過年度候補の可能性』を記録しました。"
            : "検知候補を登録しました。"
      );
      setShowForm(false);
      setForm(blank);
      await load();
    } catch (e: any) {
      alert(`登録に失敗しました: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // AI（またはルール）で抽出 → extracted_grant_candidates に保存
  async function extract(item: DiscoveredItem) {
    setExtractingId(item.id);
    setMsg(null);
    try {
      const r = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discovered_item_id: item.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "抽出に失敗しました");
      setMsg(
        `「${item.title}」を${data.engine === "ai" ? "AI" : "ルールベース"}で抽出しました。AI抽出候補画面で確認できます。`
      );
      await load();
    } catch (e: any) {
      alert(`抽出に失敗しました: ${e.message}`);
    } finally {
      setExtractingId(null);
    }
  }

  async function setStatus(item: DiscoveredItem, status: DiscoveredItem["status"]) {
    try {
      await updateDiscoveredItem(item.id, { status });
      await load();
    } catch (e: any) {
      alert(`更新に失敗しました: ${e.message}`);
    }
  }

  async function remove(id: string) {
    if (!confirm("この検知候補を削除しますか？関連するAI抽出候補も削除されます。")) return;
    try {
      await deleteDiscoveredItem(id);
      await load();
    } catch (e: any) {
      alert(`削除に失敗しました: ${e.message}`);
    }
  }

  async function seedSamples() {
    if (sites.length === 0) {
      alert("先に情報源管理でサンプル情報源を登録してください（紐づけに使います）。");
      return;
    }
    if (!confirm("サンプル検知候補3件（公式・民間まとめ・記事由来）を登録しますか？")) return;
    setBusy(true);
    try {
      // カテゴリが一致する情報源があれば紐づける
      for (const s of SAMPLE_DISCOVERED_ITEMS) {
        const matchSite = sites.find((x) => x.source_type === s.source_category);
        await createDiscoveredItem({ ...s, source_site_id: matchSite?.id ?? null });
      }
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
        <h1 className="text-xl font-bold text-ink">自動検知候補（discovered_items）</h1>
        <div className="flex gap-2">
          {items.length === 0 && (
            <button onClick={seedSamples} disabled={busy} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              サンプル3件を登録
            </button>
          )}
          <button onClick={() => { setShowForm(true); setForm(blank); }} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
            ＋ 手動で候補を追加
          </button>
        </div>
      </div>

      {msg && <p className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</p>}

      {showForm && (
        <div className="mb-6 rounded-lg border bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-ink">手動で検知候補を追加</h2>
          <p className="mb-4 text-xs text-gray-400">
            紹介サイトや記事で見つけた補助金のURL・本文を貼り付けて候補化します（本登録ではありません）。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField label="タイトル" value={form.title} onChange={(v) => set("title", v)} required />
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">情報源（任意・選ぶとカテゴリ自動設定）</span>
              <select value={form.source_site_id} onChange={(e) => selectSite(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="">指定なし</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">情報源カテゴリ</span>
              <select value={form.source_category} onChange={(e) => set("source_category", e.target.value as SourceType)} className="w-full rounded-md border px-3 py-2 text-sm">
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>{SOURCE_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>

            <TextField label="検知元URL" value={form.url} onChange={(v) => set("url", v)} placeholder="https://" />
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">検知種別</span>
              <select value={form.detection_type} onChange={(e) => set("detection_type", e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                {DETECTION_TYPES.map((d) => (
                  <option key={d} value={d}>{DETECTION_TYPE_LABEL[d]}</option>
                ))}
              </select>
            </label>

            <TextField label="公式URL（確認できていれば）" value={form.official_url} onChange={(v) => set("official_url", v)} placeholder="https://" />
            <TextField label="公募要領PDF URL" value={form.official_pdf_url} onChange={(v) => set("official_pdf_url", v)} placeholder="https://" />
          </div>

          <div className="mt-4">
            <TextArea label="本文・抜粋（AI/ルール抽出の材料）" value={form.raw_text} onChange={(v) => set("raw_text", v)} rows={4} placeholder="ページ本文や記事の抜粋を貼り付け" />
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.official_source_confirmed} onChange={(e) => set("official_source_confirmed", e.target.checked)} className="h-4 w-4" />
            公式URL／公募要領PDFを確認済み
          </label>

          <div className="mt-5 flex gap-2">
            <button onClick={add} disabled={busy} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "登録中…" : "候補を登録"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border bg-white p-8 text-center text-gray-400">
          検知候補がまだありません。「サンプル3件を登録」または「手動で候補を追加」から登録してください。
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const site = item.source_site_id ? siteMap.get(item.source_site_id) : null;
            const category = item.source_category ?? site?.source_type ?? null;
            const secondary = isSecondarySource(category);
            const officialConfirmed = item.official_source_confirmed;
            return (
              <div key={item.id} className="rounded-lg border bg-white p-4">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium text-ink">{item.title}</h3>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {site?.name ?? "情報源未指定"}・検知 {formatDate(item.detected_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {DETECTION_TYPE_LABEL[item.detection_type]}
                    </span>
                    <SourceTypeBadge type={category} />
                    <TrustBadge level={item.trust_level} />
                    <VerificationBadge status={item.verification_status} />
                    <DiscoveredStatusBadge status={item.status} />
                  </div>
                </div>

                {item.duplicate_of && (
                  <p className="mb-2 inline-block rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    重複候補（既存と類似）
                  </p>
                )}
                {item.source_warning && (
                  <p className="mb-2 inline-block rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                    {item.source_warning}
                  </p>
                )}

                <div className="mb-2 flex flex-wrap gap-3 text-xs">
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">検知元URL ↗</a>
                  )}
                  {item.official_url && (
                    <a href={item.official_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">公式URL ↗</a>
                  )}
                  {(item.official_pdf_url || item.pdf_url) && (
                    <a href={item.official_pdf_url ?? item.pdf_url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">公募要領PDF ↗</a>
                  )}
                </div>

                {item.raw_text && <p className="mb-2 line-clamp-2 text-sm text-gray-600">{item.raw_text}</p>}

                <div className="mb-3 space-y-2">
                  <SecondarySourceWarning show={secondary} />
                  <OfficialUnconfirmedWarning show={!officialConfirmed} />
                </div>

                <div className="flex flex-wrap gap-2 text-sm">
                  <button
                    onClick={() => extract(item)}
                    disabled={extractingId === item.id}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {extractingId === item.id ? "抽出中…" : "AIで抽出 → 候補化"}
                  </button>
                  <Link href="/candidates" className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                    抽出候補を見る
                  </Link>
                  {item.status !== "ignored" && (
                    <button onClick={() => setStatus(item, "ignored")} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">無視</button>
                  )}
                  {item.status !== "rejected" && (
                    <button onClick={() => setStatus(item, "rejected")} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">却下</button>
                  )}
                  <button onClick={() => remove(item.id)} className="rounded-md border px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">削除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
