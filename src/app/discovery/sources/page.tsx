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
import { DiscoveryNav } from "@/components/DiscoveryNav";
import { HelpBox, ButtonGuide } from "@/components/DiscoveryHelp";
import { formatDate } from "@/lib/utils";
import { SAMPLE_SOURCE_SITES, SAMPLE_COLLECT_SOURCES } from "@/lib/samples";

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
  const [running, setRunning] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
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

  // 5地域の公式情報源＋J-Net21 を登録（自動収集の巡回対象）
  async function seedCollectSources() {
    if (!confirm("Jグランツ・ミラサポplus・J-Net21＋公式自治体ページ（愛知/名古屋/弥富/岐阜県/岐阜市/三重県/四日市市）を情報源として登録しますか？")) return;
    setBusy(true);
    try {
      for (const s of SAMPLE_COLLECT_SOURCES) await createSourceSite(s);
      await load();
      setMsg("公式情報源を登録しました。「今すぐ全収集」または各行の「巡回」で収集できます。");
    } catch (e: any) {
      alert(`登録に失敗しました: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function callJson(url: string, body?: any) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return r.json();
  }

  // Jグランツ同期
  async function syncJgrants() {
    setRunning("jgrants");
    setMsg(null);
    try {
      const d = await callJson("/api/discovery/jgrants/sync");
      setMsg(
        d.ok
          ? `Jグランツから最新の補助金を取り込みました（新着 ${d.inserted} 件・更新 ${d.updated} 件／確認した件数 ${d.scanned} 件）。「検知候補」画面で内容を確認できます。`
          : `Jグランツからの取り込みに失敗しました。時間をおいて再度お試しください。（理由：${d.error ?? "不明"}）`
      );
      await load();
    } catch (e: any) {
      setMsg("Jグランツからの取り込みに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setRunning(null);
    }
  }

  // 全収集（Jグランツ＋公式巡回＋フィード）
  async function runAllCollect() {
    setRunning("all");
    setMsg(null);
    try {
      const d = await callJson("/api/discovery/run");
      if (d.ok) {
        const lines = (d.summaries ?? [])
          .map((s: any) => `・${s.source}：${s.ok ? `新着${s.inserted}・更新${s.updated}` : `取り込めず（${s.error ?? "?"}）`}`)
          .join("\n");
        setMsg(`全情報源から取り込みました（新着 ${d.totals.inserted} 件・更新 ${d.totals.updated} 件）。\n${lines}`);
      } else {
        setMsg(`全収集に失敗しました。時間をおいて再度お試しください。（理由：${d.error ?? "不明"}）`);
      }
      await load();
    } catch (e: any) {
      setMsg("全収集に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setRunning(null);
    }
  }

  // 個別の情報源を巡回 or フィード取得
  async function collectSource(s: SourceSite) {
    setRunning(s.id);
    setMsg(null);
    try {
      const isFeed = !!s.feed_url;
      const d = await callJson(`/api/discovery/${isFeed ? "feed" : "crawl"}?source_id=${s.id}`);
      setMsg(
        d.ok
          ? `「${s.name}」から取り込みました（新着 ${d.inserted} 件・更新 ${d.updated} 件）。`
          : `「${s.name}」から取り込めませんでした。サイト側で自動取得できない場合があります。手動での確認・追加をご検討ください。（理由：${d.error ?? "不明"}）`
      );
      await load();
    } catch (e: any) {
      setMsg("取り込みに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setRunning(null);
    }
  }

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <DiscoveryNav />
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}（discovery_schema.sql を Supabase で実行済みか確認してください）
        </p>
      )}

      <HelpBox title="この画面でできること">
        補助金情報を「どこから集めるか（情報源）」を管理する画面です。国のデータベースや自治体の公式ページを登録しておくと、
        ボタン一つで最新の補助金をまとめて取り込めます。まずは「公式情報源を登録」を1回押すのがおすすめです。
      </HelpBox>

      <ButtonGuide
        items={[
          { label: "公式情報源を登録", desc: "Jグランツ・J-Net21・ミラサポplus・各自治体（愛知/名古屋/弥富/岐阜県/岐阜市/三重県/四日市市）を情報源として一括登録します（最初に1回押せばOK）。" },
          { label: "Jグランツ同期", desc: "国の補助金データベース（Jグランツ）から、対象地域の最新の補助金を取り込みます。" },
          { label: "今すぐ全収集", desc: "登録した全情報源から最新情報をまとめて取り込みます（毎朝6時にも自動で実行されます）。" },
          { label: "サンプル8件を登録", desc: "動作確認用に、見本の情報源を8件登録します（お試し用）。" },
          { label: "＋ 情報源を追加", desc: "集めたいサイトを手動で1件追加します（名前・URL・種類などを入力）。" },
          { label: "巡回 / フィード取得", desc: "その情報源のページ（またはRSS）を読みに行き、新しい補助金候補を取り込みます。" },
          { label: "アクティブ / 停止中", desc: "押すたびに切替。アクティブな情報源だけが「全収集」の対象になります。" },
          { label: "編集 / 削除", desc: "情報源の内容を直す／一覧から消します。" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">情報源管理（監視対象サイト）</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={seedCollectSources} disabled={busy} className="rounded-md border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent/5 disabled:opacity-50">
            公式情報源を登録
          </button>
          <button onClick={syncJgrants} disabled={running !== null} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {running === "jgrants" ? "Jグランツ同期中…" : "Jグランツ同期"}
          </button>
          <button onClick={runAllCollect} disabled={running !== null} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {running === "all" ? "全収集中…" : "今すぐ全収集"}
          </button>
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

      {msg && (
        <p className="mb-4 whitespace-pre-line rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</p>
      )}

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

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField label="RSS/Atom フィードURL（任意）" value={form.feed_url ?? ""} onChange={(v) => set("feed_url", v)} placeholder="https://.../rss" />
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">対象（事業者/個人）</span>
              <select value={form.audience_scope ?? "both"} onChange={(e) => set("audience_scope", e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="both">事業者・個人の両方</option>
                <option value="business">事業者向け</option>
                <option value="individual">個人向け</option>
                <option value="unknown">未判定</option>
              </select>
            </label>
          </div>

          <div className="mt-4">
            <TextArea label="メモ" value={form.notes ?? ""} onChange={(v) => set("notes", v)} rows={2} />
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="h-4 w-4" />
            アクティブ（自動収集・全収集の対象にする）
          </label>

          <p className="mt-3 text-xs text-gray-400">
            feed_url があればRSS購読、無ければURLをサーバー側fetchで巡回します。取得不可（robots/JS描画等）の場合は手動確認に切り替えてください。
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
                    {(s.url || s.feed_url) && (
                      <button onClick={() => collectSource(s)} disabled={running !== null} className="mr-3 text-emerald-600 hover:underline disabled:opacity-40">
                        {running === s.id ? "取得中…" : s.feed_url ? "フィード取得" : "巡回"}
                      </button>
                    )}
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
