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
  fetchProfiles,
} from "@/lib/supabase";
import type { DiscoveredItem, DiscoveredItemInput, SourceSite, Grant, BusinessProfile } from "@/lib/types";
import {
  DETECTION_TYPES,
  DETECTION_TYPE_LABEL,
  SOURCE_TYPES,
  SOURCE_TYPE_LABEL,
  COLLECT_TARGET_REGIONS,
  REVIEW_STATES,
  REVIEW_STATE_LABEL,
  REVIEW_STATE_COLORS,
  type SourceType,
  type ReviewState,
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
import { DiscoveryNav } from "@/components/DiscoveryNav";
import { HelpBox, ButtonGuide } from "@/components/DiscoveryHelp";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import { formatDate, formatAmount, daysUntil } from "@/lib/utils";
import { isSecondarySource, deriveTrustLevel, detectDuplicateFlags, scoreDiscoveredAgainstProfiles, ruleExtract, suggestNextActions, buildNormalizedKey } from "@/lib/discovery";
import { expandQuery } from "@/lib/synonyms";
import { PURPOSES } from "@/lib/constants";
import { isSampleDiscovered, sampleButtonsVisible } from "@/lib/sampleFilter";
import { lifecycle, extractStartDate, feasibility, preparation, priority } from "@/lib/lifecycle";
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

// 使い道で絞る（brief §12）。メイン導線ではなく絞り込みとして配置する。
const USE_GROUPS: { key: string; label: string; purposes: string[] }[] = [
  { key: "renov", label: "店舗改装", purposes: ["店舗改装", "内装工事"] },
  { key: "equip", label: "空調・設備", purposes: ["空調設備", "省エネ", "設備導入", "防犯カメラ", "POS導入", "省力化"] },
  { key: "web", label: "ホームページ・EC", purposes: ["EC強化", "ホームページ制作", "予約システム"] },
  { key: "ad", label: "広告宣伝", purposes: ["広告宣伝", "販路開拓"] },
  { key: "hr", label: "採用・研修", purposes: ["スタッフ採用", "社員教育"] },
  { key: "dx", label: "AI・DX", purposes: ["AI導入", "DX", "業務自動化"] },
  { key: "event", label: "イベント", purposes: ["イベント開催", "地域活動"] },
  { key: "startup", label: "創業・新店舗", purposes: ["創業", "新店舗出店", "商品開発"] },
];

// 申請前の注意（brief §24）。怖くしすぎず、初心者に分かる言葉で。
function preApplicationWarnings(text: string, preNg: boolean, professional: boolean): string[] {
  const t = text ?? "";
  const out: string[] = [];
  if (preNg || /(交付決定前|事前着手|着手前|契約.{0,4}前|発注.{0,4}前)/.test(t)) out.push("先に買うと対象外になる可能性");
  if (/見積/.test(t)) out.push("見積書が必要な可能性");
  if (/(GビズID|gBizID|gビズ|ｇビズ)/i.test(t)) out.push("GビズIDが必要な可能性");
  if (/(事業計画|計画書)/.test(t)) out.push("事業計画書が必要な可能性");
  if (/(予算上限|先着|早期終了|予算がなくなり|なくなり次第)/.test(t)) out.push("予算上限で早期終了の可能性");
  if (professional || /(社会保険労務士|社労士|行政書士|認定支援機関|税理士)/.test(t)) out.push("専門家（士業）の確認がおすすめ");
  return out.slice(0, 4);
}

export default function DiscoveredPage() {
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [sites, setSites] = useState<SourceSite[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [form, setForm] = useState<AddForm>(blank);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [editTextId, setEditTextId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // フィルター
  const [fHigh, setFHigh] = useState(false);
  const [fDeadline, setFDeadline] = useState(false);
  const [fUnreviewed, setFUnreviewed] = useState(false);
  const [fApplicant, setFApplicant] = useState(false);
  const [fProfile, setFProfile] = useState("");
  const [fSource, setFSource] = useState("");
  const [fRegion, setFRegion] = useState("");
  const [fStartToday, setFStartToday] = useState(false);
  const [fStartSoon, setFStartSoon] = useState(false);
  const [fUse, setFUse] = useState("");
  const [showSamples, setShowSamples] = useState(false);
  // 表示モード：初心者モード（既定）＝判断に必要な情報だけ／詳細モード＝管理・検証用情報も表示
  const [detailMode, setDetailMode] = useState(false);

  // トップの各カードからの遷移（?view=...）でフィルター初期化
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "today-start") setFStartToday(true);
    else if (view === "soon-start") setFStartSoon(true);
    else if (view === "deadline") setFDeadline(true);
    else if (view === "high") setFHigh(true);
    else if (view === "unreviewed") setFUnreviewed(true);
    else if (view === "applicant") setFApplicant(true);
  }, []);
  // メモ編集・トースト
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2600);
  }

  async function load() {
    const [it, ss, gr, pr] = await Promise.all([
      fetchDiscoveredItems(),
      fetchSourceSites(),
      fetchGrants(),
      fetchProfiles(),
    ]);
    setItems(it);
    setSites(ss);
    setGrants(gr);
    setProfiles(pr);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const set = (k: keyof AddForm, v: any) => setForm((p) => ({ ...p, [k]: v }));

  // 候補ごとの表示用データ（相性スコア・地域・締切・補助額/補助率・理由）。
  //   保存済みの自動照合結果を優先し、無ければクライアントで即時計算（フォールバック）。
  function view(item: DiscoveredItem) {
    const sc = scoreDiscoveredAgainstProfiles(item, profiles);
    const ex = ruleExtract(item);
    const start = extractStartDate(item.raw_text);
    const deadline = item.extracted_deadline ?? sc.deadline;
    const score = item.match_score ?? sc.bestScore;
    const lc = lifecycle(start, deadline);
    const ptext = `${item.title ?? ""}\n${item.raw_text ?? ""}`;
    const purposes = Array.from(new Set([...expandQuery(ptext).purposes, ...PURPOSES.filter((p) => ptext.includes(p))]));
    // 実施機関（J-Net21等の本文「実施機関: X」から抽出）
    const orgMatch = (item.raw_text ?? "").match(/実施機関[：:]\s*([^\n｜|]{1,40})/);
    const organizer = orgMatch ? orgMatch[1].trim() : "";
    return {
      score,
      profile: item.match_profile ?? sc.bestProfile,
      deadline,
      start,
      lc,
      pr: priority(score, lc.key),
      purposes,
      organizer,
      warnings: preApplicationWarnings(item.raw_text ?? "", ex.pre_application_ng_risk, ex.professional_check_recommended),
      reason: item.match_reason ?? sc.reason,
      regions: ex.target_regions,
      maxAmount: ex.max_amount,
      subsidyRate: ex.subsidy_rate,
      preNg: ex.pre_application_ng_risk,
      professional: ex.professional_check_recommended,
      reviewState: (item.review_state ?? "ai_judged") as ReviewState,
    };
  }

  const viewMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof view>>();
    for (const it of items) m.set(it.id, view(it));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, profiles]);

  // 複数ソースから来た同名候補（正規化キーが複数の external_source に跨る）を「重複可能性あり」とする
  const crossDupKeys = useMemo(() => {
    const bySource = new Map<string, Set<string>>();
    for (const it of items) {
      const key = it.normalized_key ?? buildNormalizedKey(it.title);
      if (!key) continue;
      const src = it.external_source ?? "manual";
      if (!bySource.has(key)) bySource.set(key, new Set());
      bySource.get(key)!.add(src);
    }
    const dup = new Set<string>();
    for (const [key, srcs] of bySource) if (srcs.size >= 2) dup.add(key);
    return dup;
  }, [items]);
  const isCrossDup = (it: DiscoveredItem) =>
    crossDupKeys.has(it.normalized_key ?? buildNormalizedKey(it.title));

  // フィルター適用後の候補（既定で「使えそうな順／確認すべき順」に並べる：brief §13）
  const filtered = useMemo(() => {
    return items.filter((it) => {
      const v = viewMap.get(it.id)!;
      if (!showSamples && isSampleDiscovered(it)) return false; // サンプル除外（既定）
      if (fStartToday && v.lc.key !== "today_start") return false;
      if (fStartSoon && v.lc.key !== "today_start" && v.lc.key !== "soon_start") return false;
      if (fHigh && v.score < 70) return false;
      if (fDeadline) {
        const d = daysUntil(v.deadline);
        if (d == null || d < 0 || d > 30) return false;
      }
      if (fUnreviewed && it.status !== "unreviewed") return false;
      if (fApplicant && v.reviewState !== "applicant") return false;
      if (fProfile && v.profile !== fProfile) return false;
      if (fSource) {
        const cat = it.source_category ?? siteMap.get(it.source_site_id ?? "")?.source_type ?? "";
        if (cat !== fSource) return false;
      }
      if (fRegion && !v.regions.includes(fRegion)) return false;
      if (fUse) {
        const grp = USE_GROUPS.find((g) => g.key === fUse);
        if (grp && !grp.purposes.some((p) => v.purposes.includes(p))) return false;
      }
      return true;
    }).sort((a, b) => viewMap.get(b.id)!.pr.sort - viewMap.get(a.id)!.pr.sort);
  }, [items, viewMap, fHigh, fDeadline, fUnreviewed, fApplicant, fProfile, fSource, siteMap, fRegion, fUse, showSamples, fStartToday, fStartSoon]);

  async function setReview(item: DiscoveredItem, state: ReviewState) {
    try {
      await updateDiscoveredItem(item.id, { review_state: state });
      showToast(`状態を「${REVIEW_STATE_LABEL[state]}」に保存しました`);
      await load();
    } catch (e: any) {
      showToast(`保存に失敗しました（${e.message ?? "不明"}）`, false);
    }
  }

  function startNote(item: DiscoveredItem) {
    setNoteEditId(item.id);
    setNoteText(item.human_note ?? "");
  }
  async function saveNote(item: DiscoveredItem) {
    try {
      await updateDiscoveredItem(item.id, { human_note: noteText || null });
      setNoteEditId(null);
      setNoteText("");
      showToast("メモを保存しました");
      await load();
    } catch (e: any) {
      showToast(`メモの保存に失敗しました（${e.message ?? "不明"}）`, false);
    }
  }

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
      const r = await fetch("/api/discovery/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discovered_item_id: item.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "抽出に失敗しました");
      const engineLabel = data.engine === "ai" ? "AI" : "ルールベース";
      let m = `「${item.title}」を${engineLabel}で抽出しました（確信度${data.confidence_score}）。整理済み候補画面で確認できます。`;
      if (data.fetch_attempted && !data.fetch_succeeded) {
        m += ` ※URLからの本文取得に失敗（${data.fetch_reason ?? "不明"}）。精度を上げるには、この候補を編集して本文を貼り付けてから再抽出してください。`;
      } else if (data.fetch_succeeded) {
        m += " ※URLから本文を取得して抽出しました。";
      }
      if (Array.isArray(data.missing_fields) && data.missing_fields.length) {
        m += ` 未抽出項目：${data.missing_fields.join(" / ")}`;
      }
      setMsg(m);
      await load();
    } catch (e: any) {
      alert(`抽出に失敗しました: ${e.message}`);
    } finally {
      setExtractingId(null);
    }
  }

  function startEditText(item: DiscoveredItem) {
    setEditTextId(item.id);
    setEditText(item.raw_text ?? "");
  }

  async function saveText(item: DiscoveredItem) {
    try {
      await updateDiscoveredItem(item.id, { raw_text: editText || null });
      setEditTextId(null);
      setEditText("");
      setMsg("本文を保存しました。「内容を整理」を押すと、この本文から抽出します。");
      await load();
    } catch (e: any) {
      alert(`保存に失敗しました: ${e.message}`);
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
    if (!confirm("この検知候補を削除しますか？関連する整理済み候補も削除されます。")) return;
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
      <DiscoveryNav />
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}（discovery_schema.sql を Supabase で実行済みか確認してください）
        </p>
      )}

      <HelpBox title="この画面でできること">
        あなたが使えるかもしれない補助金・助成金の「候補」が、確認すべき順（S/A/B/C/D）に並びます。
        各候補は公式情報の確認前の下書きです。気になるものは「公式ページを見る」で確認し、使えそうなら「申請を検討する」、不要なら「今回は使わない」に整理できます。
        既定は<strong>初心者モード</strong>（判断に必要な情報だけ表示）。管理・検証用の情報を見たいときは右上の<strong>詳細モード</strong>に切り替えてください。
      </HelpBox>

      <ButtonGuide
        items={[
          { label: "公式ページを見る", desc: "この候補の元になった公式ページ・公募要領を新しいタブで開きます。最終判断は必ずここで確認してください。" },
          { label: "申請を検討する / 今回は使わない", desc: "使えそうな候補は「申請を検討する」、不要な候補は「今回は使わない」で整理します（削除ではありません）。" },
          { label: "対象・金額・締切を確認する", desc: "候補の文章やURLから、補助金の対象・金額・締切などをAI（鍵が無ければ簡易ルール）が読み取って整理します。" },
          { label: "申請前チェック", desc: "公式ページで確認すべき項目（対象地域・締切・対象経費・事前着手の可否など）をチェックリストで確認できます。" },
          { label: "（詳細モード）本文を貼り付け/編集・無視/却下・削除", desc: "本文の貼り付けや、管理用の分類・削除は詳細モードで操作できます。" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">候補になった補助金・助成金</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5 text-xs">
            <button onClick={() => setDetailMode(false)} className={`rounded px-2.5 py-1 transition ${!detailMode ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>初心者モード</button>
            <button onClick={() => setDetailMode(true)} className={`rounded px-2.5 py-1 transition ${detailMode ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>詳細モード</button>
          </div>
          {sampleButtonsVisible() && (
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
            本文が空でURLがある場合、抽出時にサーバー側でURL取得を試みます。取得できない場合（アクセス拒否・JS描画など）は、各候補の「本文を貼り付け/編集」から本文を貼ってください。
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

      {/* フィルター */}
      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-xs">
          <span className="font-semibold text-gray-600">絞り込み：</span>
          <button onClick={() => setFStartToday((v) => !v)} className={`rounded-full border px-2.5 py-1 ${fStartToday ? "border-blue-400 bg-blue-50 text-blue-800" : "text-gray-600 hover:bg-gray-50"}`}>本日開始</button>
          <button onClick={() => setFStartSoon((v) => !v)} className={`rounded-full border px-2.5 py-1 ${fStartSoon ? "border-sky-400 bg-sky-50 text-sky-800" : "text-gray-600 hover:bg-gray-50"}`}>近日開始</button>
          <button onClick={() => setFHigh((v) => !v)} className={`rounded-full border px-2.5 py-1 ${fHigh ? "border-green-400 bg-green-50 text-green-800" : "text-gray-600 hover:bg-gray-50"}`}>高相性のみ(70+)</button>
          <button onClick={() => setFDeadline((v) => !v)} className={`rounded-full border px-2.5 py-1 ${fDeadline ? "border-red-400 bg-red-50 text-red-700" : "text-gray-600 hover:bg-gray-50"}`}>締切30日以内</button>
          <button onClick={() => setFUnreviewed((v) => !v)} className={`rounded-full border px-2.5 py-1 ${fUnreviewed ? "border-sky-400 bg-sky-50 text-sky-800" : "text-gray-600 hover:bg-gray-50"}`}>未確認のみ</button>
          <button onClick={() => setFApplicant((v) => !v)} className={`rounded-full border px-2.5 py-1 ${fApplicant ? "border-amber-400 bg-amber-50 text-amber-800" : "text-gray-600 hover:bg-gray-50"}`}>申請候補のみ</button>
          <select value={fProfile} onChange={(e) => setFProfile(e.target.value)} className="rounded-md border px-2 py-1">
            <option value="">事業プロフィール（すべて）</option>
            {profiles.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="rounded-md border px-2 py-1">
            <option value="">情報源（すべて）</option>
            {SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABEL[t]}</option>)}
          </select>
          <select value={fRegion} onChange={(e) => setFRegion(e.target.value)} className="rounded-md border px-2 py-1">
            <option value="">地域（すべて）</option>
            {COLLECT_TARGET_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {(fHigh || fDeadline || fUnreviewed || fApplicant || fProfile || fSource || fRegion || fStartToday || fStartSoon || fUse) && (
            <button onClick={() => { setFHigh(false); setFDeadline(false); setFUnreviewed(false); setFApplicant(false); setFProfile(""); setFSource(""); setFRegion(""); setFStartToday(false); setFStartSoon(false); setFUse(""); }} className="rounded-full border px-2.5 py-1 text-gray-500 hover:bg-gray-50">クリア</button>
          )}
          {sampleButtonsVisible() && (
            <label className="ml-auto flex items-center gap-1 text-gray-500">
              <input type="checkbox" checked={showSamples} onChange={(e) => setShowSamples(e.target.checked)} className="h-3.5 w-3.5" />
              サンプルも表示
            </label>
          )}
          <span className={`text-gray-400 ${sampleButtonsVisible() ? "" : "ml-auto"}`}>{filtered.length} / {items.length} 件</span>
        </div>
      )}

      {/* 使い道で絞る（メインではなく絞り込み。初心者に目的を最初から選ばせない） */}
      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-gray-600">使い道で絞る：</span>
          {USE_GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setFUse((v) => (v === g.key ? "" : g.key))}
              className={`rounded-full border px-2.5 py-1 ${fUse === g.key ? "border-accent bg-accent/10 text-accent" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <NoCandidates />
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border bg-white p-8 text-center text-gray-400">条件に合う候補がありません。絞り込みを変えるか、上の「クリア」で条件を外してください。</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const v = viewMap.get(item.id)!;
            const site = item.source_site_id ? siteMap.get(item.source_site_id) : null;
            const category = item.source_category ?? site?.source_type ?? null;
            const secondary = isSecondarySource(category);
            const officialConfirmed = item.official_source_confirmed;
            // 出典表示（ミラサポplus 由来は必須）
            const attribution =
              item.external_source === "mirasapo" ||
              (site?.url ?? "").includes("mirasapo-plus.go.jp") ||
              (site?.name ?? "").includes("ミラサポ")
                ? "出典：中小企業庁『ミラサポplus』"
                : null;
            return (
              <div key={item.id} className="rounded-lg border bg-white p-4">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {site?.name ?? "情報源未指定"}・検知 {formatDate(item.detected_at)}
                    </div>
                    {attribution && <div className="mt-0.5 text-[11px] text-gray-500">{attribution}</div>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${v.pr.tone}`} title={v.pr.label}>{v.pr.rank}：{v.pr.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.lc.tone}`}>{v.lc.icon} {v.lc.label}</span>
                    {v.score > 0 && (
                      <span className="rounded-md bg-green-100 px-2 py-0.5 text-sm font-bold text-green-800" title="あなたに合いそう度">合いそう {v.score}</span>
                    )}
                    {detailMode && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_STATE_COLORS[v.reviewState]}`}>
                        {REVIEW_STATE_LABEL[v.reviewState]}
                      </span>
                    )}
                  </div>
                </div>

                {/* 大きく見せる要点（地域・締切・補助額/率・対象事業） */}
                <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <KeyVal label="対象地域" value={v.regions.slice(0, 3).join("・") || "—"} />
                  {v.organizer && <KeyVal label="実施機関" value={v.organizer} />}
                  <KeyVal label="締切" value={v.deadline ? `${formatDate(v.deadline)}${daysUntil(v.deadline) != null && daysUntil(v.deadline)! >= 0 ? `（あと${daysUntil(v.deadline)}日）` : ""}` : "—"} highlight={(() => { const d = daysUntil(v.deadline); return d != null && d >= 0 && d <= 14; })()} />
                  <KeyVal label="補助額/補助率" value={v.maxAmount != null ? formatAmount(v.maxAmount) : v.subsidyRate || "—"} />
                  <KeyVal label="対象事業" value={v.profile || "—"} />
                </div>
                {v.reason && (
                  <p className="mb-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    <span className="font-medium text-slate-500">なぜ候補に出たか：</span>{v.reason}
                  </p>
                )}

                {/* 今から間に合う？ ／ 準備目安 */}
                {(() => { const feas = feasibility(v.deadline); const prep = preparation({ text: item.raw_text, professional: v.professional, preNg: v.preNg }); return (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-gray-400">間に合う？</span>
                    <span className={`rounded px-1.5 py-0.5 ${feas.tone}`}>{feas.label}</span>
                    <span className="ml-1 text-gray-400">準備目安</span>
                    <span className={`rounded px-1.5 py-0.5 ${prep.tone}`}>{prep.label}</span>
                  </div>
                ); })()}

                {/* 申請前の注意（怖くしすぎず、確認を促す） */}
                {v.warnings.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    <span className="text-[11px] font-medium text-amber-700">申請前の注意：</span>
                    {v.warnings.map((w) => (
                      <span key={w} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 ring-1 ring-amber-100">{w}</span>
                    ))}
                  </div>
                )}

                {/* 次にやること */}
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-medium text-orange-700">次にやること：</span>
                  {suggestNextActions(item).map((a) => (
                    <span key={a} className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-800 ring-1 ring-orange-100">{a}</span>
                  ))}
                </div>

                {detailMode && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {DETECTION_TYPE_LABEL[item.detection_type]}
                    </span>
                    <SourceTypeBadge type={category} />
                    <TrustBadge level={item.trust_level} />
                    <VerificationBadge status={item.verification_status} />
                  </div>
                )}

                {(item.duplicate_of || isCrossDup(item)) && (
                  <p className="mb-2 inline-block rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    {isCrossDup(item) ? "重複可能性あり（複数の情報源で同名）" : "重複候補（既存と類似）"}
                  </p>
                )}
                {item.source_warning && (
                  <p className="mb-2 inline-block rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                    {item.source_warning}
                  </p>
                )}

                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                  {(item.official_url || item.url) && (
                    <a
                      href={item.official_url ?? item.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      title="この候補の元になった実際のページを新しいタブで開きます"
                    >
                      公式ページを見る ↗
                    </a>
                  )}
                  {(item.official_pdf_url || item.pdf_url) && (
                    <a href={item.official_pdf_url ?? item.pdf_url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">公募要領PDF ↗</a>
                  )}
                  {detailMode && item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">検知元URL ↗</a>
                  )}
                  {detailMode && item.official_url && (
                    <a href={item.official_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">公式URL ↗</a>
                  )}
                  {detailMode && item.fetched_at && (
                    <span className="text-gray-400">取得 {formatDate(item.fetched_at)}{item.extraction_confidence != null ? `・確信度${item.extraction_confidence}` : ""}</span>
                  )}
                </div>

                {detailMode && item.raw_text && <p className="mb-2 line-clamp-2 text-sm text-gray-600">{item.raw_text}</p>}

                <div className="mb-3 space-y-2">
                  <SecondarySourceWarning show={secondary} />
                  <OfficialUnconfirmedWarning show={!officialConfirmed} />
                </div>

                {editTextId === item.id && (
                  <div className="mb-3 rounded-md border bg-slate-50 p-3">
                    <p className="mb-1 text-xs text-gray-500">
                      本文を貼り付け（URL取得が失敗した場合のフォールバック）。保存後に「内容を整理」してください。
                    </p>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="ページ本文や記事の抜粋を貼り付け"
                    />
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => saveText(item)} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">本文を保存</button>
                      <button onClick={() => { setEditTextId(null); setEditText(""); }} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">キャンセル</button>
                    </div>
                  </div>
                )}

                {/* 担当者メモ */}
                <div className="mb-2">
                  {noteEditId === item.id ? (
                    <div className="rounded-md border bg-amber-50 p-2">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        placeholder="例：市役所確認済み／対象外だった／来年度狙う"
                      />
                      <div className="mt-1 flex gap-2">
                        <button onClick={() => saveNote(item)} className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:opacity-90">メモを保存</button>
                        <button onClick={() => { setNoteEditId(null); setNoteText(""); }} className="rounded-md border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">キャンセル</button>
                      </div>
                    </div>
                  ) : item.human_note ? (
                    <div className="flex items-start gap-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                      <span className="font-medium">📝メモ：</span>
                      <span className="flex-1 whitespace-pre-wrap">{item.human_note}</span>
                      <button onClick={() => startNote(item)} className="shrink-0 text-amber-700 hover:underline">編集</button>
                    </div>
                  ) : (
                    <button onClick={() => startNote(item)} className="text-xs text-gray-500 hover:text-accent hover:underline">＋ メモを追加</button>
                  )}
                </div>

                {/* 状態の変更（AI判定と人間確認を区別） */}
                {detailMode ? (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-gray-400">状態：</span>
                    {(["unconfirmed", "human_ok", "applicant", "not_needed"] as ReviewState[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => setReview(item, st)}
                        className={`rounded-full border px-2.5 py-0.5 ${v.reviewState === st ? REVIEW_STATE_COLORS[st] + " border-transparent font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        {REVIEW_STATE_LABEL[st]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <button
                      onClick={() => setReview(item, "applicant")}
                      className={`rounded-md px-3 py-1.5 font-medium ${v.reviewState === "applicant" ? "bg-purple-600 text-white" : "border border-purple-300 text-purple-700 hover:bg-purple-50"}`}
                    >
                      📝 申請を検討する
                    </button>
                    <button
                      onClick={() => setReview(item, "not_needed")}
                      className={`rounded-md px-3 py-1.5 ${v.reviewState === "not_needed" ? "bg-gray-400 text-white" : "border border-gray-300 text-gray-500 hover:bg-gray-50"}`}
                    >
                      － 今回は使わない
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 text-sm">
                  {(item.official_url || item.url) && (
                    <a
                      href={item.official_url ?? item.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      title="元になった実際のページを開きます"
                    >
                      公式ページを見る ↗
                    </a>
                  )}
                  <button
                    onClick={() => setChecklistId((id) => (id === item.id ? null : item.id))}
                    className={`rounded-md border px-3 py-1.5 text-xs ${checklistId === item.id ? "border-accent bg-accent/5 text-accent" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    申請前チェック
                  </button>
                  {detailMode && (
                    <>
                      <button
                        onClick={() => extract(item)}
                        disabled={extractingId === item.id}
                        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {extractingId === item.id ? "整理中…" : "対象・金額・締切を確認する"}
                      </button>
                      <button
                        onClick={() => startEditText(item)}
                        className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        本文を貼り付け/編集
                      </button>
                      <Link href="/discovery/review" className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                        AIの参考整理を見る
                      </Link>
                      {item.status !== "ignored" && (
                        <button onClick={() => setStatus(item, "ignored")} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">無視</button>
                      )}
                      {item.status !== "rejected" && (
                        <button onClick={() => setStatus(item, "rejected")} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">却下</button>
                      )}
                      <button onClick={() => remove(item.id)} className="rounded-md border px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">削除</button>
                    </>
                  )}
                </div>

                {checklistId === item.id && (
                  <div className="mt-3">
                    <ChecklistPanel item={item} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-lg ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.ok ? "✓ " : "⚠ "}{toast.text}
        </div>
      )}
    </div>
  );
}

// 候補0件のときの初心者向け案内（サンプルには触れず、次の行動を示す）
function NoCandidates() {
  return (
    <div className="rounded-lg border bg-white p-8 text-center">
      <div className="mb-2 text-3xl">🔎</div>
      <p className="mb-1 font-semibold text-ink">まだ候補がありません</p>
      <p className="mb-5 text-sm text-gray-500">次の方法で補助金・助成金を追加できます。</p>
      <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
        <Link href="/discovery/sources" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">新しい制度を探す</Link>
        <Link href="/discovery/import-url" className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">URLから追加する</Link>
        <Link href="/search" className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">相談して探す</Link>
        <Link href="/setup" className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">事業情報を登録する</Link>
      </div>
    </div>
  );
}

function KeyVal({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className={`truncate text-sm ${highlight ? "font-semibold text-red-600" : "text-ink"}`}>{value}</div>
    </div>
  );
}
