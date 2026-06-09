"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchExtractedCandidates,
  fetchDiscoveredItems,
  createGrant,
  createImportReview,
  updateDiscoveredItem,
  deleteExtractedCandidate,
} from "@/lib/supabase";
import type { ExtractedGrantCandidate, DiscoveredItem } from "@/lib/types";
import { isSecondarySource, candidateToGrantInput } from "@/lib/discovery";
import {
  TrustBadge,
  SourceTypeBadge,
  VerificationBadge,
  SecondarySourceWarning,
  OfficialUnconfirmedWarning,
} from "@/components/Badges";
import { DiscoveryNav } from "@/components/DiscoveryNav";
import { HelpBox, ButtonGuide } from "@/components/DiscoveryHelp";
import { formatAmount, formatDate } from "@/lib/utils";

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<ExtractedGrantCandidate[]>([]);
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [c, it] = await Promise.all([fetchExtractedCandidates(), fetchDiscoveredItems()]);
    setCandidates(c);
    setItems(it);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function officialConfirmed(c: ExtractedGrantCandidate): boolean {
    const di = c.discovered_item_id ? itemMap.get(c.discovered_item_id) : null;
    return Boolean(
      di?.official_source_confirmed ||
        c.verification_status === "official_found" ||
        c.verification_status === "verified" ||
        c.official_url ||
        c.official_pdf_url
    );
  }

  async function runRematch(grantId: string) {
    try {
      const r = await fetch("/api/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_id: grantId, is_new: true }),
      });
      const data = await r.json();
      return data.high_match_count as number;
    } catch {
      return null;
    }
  }

  // 正式登録：公式確認済みの候補だけ grants に本登録 → 全事業と自動照合
  async function approveImport(c: ExtractedGrantCandidate) {
    if (!officialConfirmed(c)) {
      alert(
        "公式URLまたは公募要領PDFが未確認のため、本登録できません。\n検知候補画面で公式情報を確認・登録してから本登録してください。"
      );
      return;
    }
    if (!confirm(`「${c.name}」を正式な補助金として登録し、全事業プロフィールと自動照合しますか？`)) return;
    setBusyId(c.id);
    setMsg(null);
    try {
      const grant = await createGrant(candidateToGrantInput(c));
      const high = await runRematch(grant.id);
      await createImportReview({
        extracted_grant_candidate_id: c.id,
        reviewer_name: reviewer || null,
        review_status: "approved",
        review_note: "AI抽出候補から正式登録",
        approved_grant_id: grant.id,
      });
      if (c.discovered_item_id) {
        await updateDiscoveredItem(c.discovered_item_id, {
          status: "imported",
          verification_status: "verified",
        });
      }
      setMsg(
        high == null
          ? `「${c.name}」を正式登録しました（自動照合は確認できませんでした）。`
          : `「${c.name}」を正式登録し、全事業と自動照合しました。高相性：${high}件。`
      );
      await load();
    } catch (e: any) {
      alert(`本登録に失敗しました: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function review(c: ExtractedGrantCandidate, status: "rejected" | "needs_more_info") {
    const note = status === "needs_more_info"
      ? prompt("どの点の追加確認が必要ですか？（任意）") ?? ""
      : prompt("却下の理由（任意）") ?? "";
    setBusyId(c.id);
    try {
      await createImportReview({
        extracted_grant_candidate_id: c.id,
        reviewer_name: reviewer || null,
        review_status: status,
        review_note: note || null,
      });
      if (c.discovered_item_id) {
        await updateDiscoveredItem(c.discovered_item_id, {
          status: status === "rejected" ? "rejected" : "candidate",
          verification_status: status === "rejected" ? "rejected" : "needs_review",
        });
      }
      setMsg(status === "rejected" ? "却下として記録しました。" : "要追加確認として記録しました。");
      await load();
    } catch (e: any) {
      alert(`記録に失敗しました: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function markDuplicate(c: ExtractedGrantCandidate) {
    if (!confirm("この候補を重複として扱い、検知候補を『無視』にしますか？")) return;
    setBusyId(c.id);
    try {
      await createImportReview({
        extracted_grant_candidate_id: c.id,
        reviewer_name: reviewer || null,
        review_status: "rejected",
        review_note: "重複候補として却下",
      });
      if (c.discovered_item_id) {
        await updateDiscoveredItem(c.discovered_item_id, { status: "ignored" });
      }
      setMsg("重複候補として記録しました。");
      await load();
    } catch (e: any) {
      alert(`記録に失敗しました: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("このAI抽出候補を削除しますか？")) return;
    try {
      await deleteExtractedCandidate(id);
      await load();
    } catch (e: any) {
      alert(`削除に失敗しました: ${e.message}`);
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
        AIが整理した補助金の候補を最後に確認して、問題なければ「正式登録」する画面です。正式登録すると、補助金の正式リストに追加され、登録済みの全事業と自動で照合されます。
        公式サイト・公募要領が未確認のものは、確認できるまで正式登録できないようになっています（誤った情報の登録を防ぐため）。
      </HelpBox>

      <ButtonGuide
        items={[
          { label: "正式登録する", desc: "この補助金を正式リストに追加し、登録済みの全事業と自動で照合します（高相性ならアラートが出ます）。公式情報の確認が済んでいるものだけ押せます。" },
          { label: "要追加確認", desc: "情報が足りない・もう少し調べたい候補に印を付けます（メモを残せます）。" },
          { label: "重複として扱う", desc: "他で登録済みと同じ制度のとき、重複として記録し一覧から外します。" },
          { label: "却下する", desc: "使わない候補として記録します（理由メモを残せます）。" },
          { label: "削除", desc: "この抽出候補を完全に消します。" },
          { label: "確認者", desc: "誰が確認したかを記録したいときに名前を入れます（任意）。" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">AI抽出候補の確認（extracted_grant_candidates）</h1>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          確認者
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="氏名（任意）" className="rounded-md border px-2 py-1 text-sm" />
        </label>
      </div>

      {msg && <p className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</p>}

      {candidates.length === 0 ? (
        <p className="rounded-lg border bg-white p-8 text-center text-gray-400">
          AI抽出候補がまだありません。
          <Link href="/discovery/items" className="text-accent hover:underline"> 検知候補画面</Link>
          で「AIで抽出 → 候補化」を実行してください。
        </p>
      ) : (
        <div className="space-y-4">
          {candidates.map((c) => {
            const secondary = isSecondarySource(c.source_category);
            const confirmed = officialConfirmed(c);
            return (
              <div key={c.id} className="rounded-lg border bg-white p-4">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold text-ink">{c.name ?? "（名称未抽出）"}</h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">確信度 {c.confidence_score}</span>
                    <SourceTypeBadge type={c.source_category} />
                    <TrustBadge level={c.trust_level} />
                    <VerificationBadge status={c.verification_status} />
                  </div>
                </div>

                <div className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <Field label="種別" value={c.grant_type} />
                  <Field label="実施主体" value={c.organizer} />
                  <Field label="対象地域" value={c.target_regions.join("、") || null} />
                  <Field label="対象業種" value={c.target_industries.join("、") || null} />
                  <Field label="対象法人種別" value={c.target_business_types.join("、") || null} />
                  <Field label="対象経費" value={c.eligible_expenses.join("、") || null} />
                  <Field label="補助率" value={c.subsidy_rate} />
                  <Field label="補助上限額" value={c.max_amount != null ? formatAmount(c.max_amount) : null} />
                  <Field label="募集状態" value={c.application_status} />
                  <Field label="締切" value={c.deadline ? formatDate(c.deadline) : null} />
                </div>

                {(c.pre_application_ng_risk || c.professional_check_recommended) && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {c.pre_application_ng_risk && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">申請前着手NGの可能性</span>}
                    {c.professional_check_recommended && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">士業確認推奨</span>}
                  </div>
                )}

                {c.missing_fields.length > 0 && (
                  <p className="mb-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">抽出できなかった項目：</span>
                    {c.missing_fields.join(" / ")}
                  </p>
                )}

                <div className="mb-2 flex flex-wrap gap-3 text-xs">
                  {c.official_url && <a href={c.official_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">公式URL ↗</a>}
                  {c.official_pdf_url && <a href={c.official_pdf_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">公募要領PDF ↗</a>}
                </div>

                <div className="mb-3 space-y-2">
                  <SecondarySourceWarning show={secondary} />
                  <OfficialUnconfirmedWarning show={!confirmed} />
                </div>

                <div className="flex flex-wrap gap-2 text-sm">
                  <button
                    onClick={() => approveImport(c)}
                    disabled={busyId === c.id || !confirmed}
                    title={!confirmed ? "公式URL/公募要領PDFの確認が必要です" : undefined}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busyId === c.id ? "処理中…" : "正式登録する"}
                  </button>
                  <button onClick={() => review(c, "needs_more_info")} disabled={busyId === c.id} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">要追加確認</button>
                  <button onClick={() => markDuplicate(c)} disabled={busyId === c.id} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">重複として扱う</button>
                  <button onClick={() => review(c, "rejected")} disabled={busyId === c.id} className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">却下する</button>
                  <button onClick={() => remove(c.id)} className="rounded-md border px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">削除</button>
                </div>
                {!confirmed && (
                  <p className="mt-2 text-xs text-orange-700">
                    公式URL／公募要領PDFが未確認のため「正式登録」は無効です。検知候補画面で公式情報を確認してください。
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-1">
      <span className="shrink-0 text-gray-400">{label}：</span>
      <span className={value ? "text-ink" : "text-gray-300"}>{value ?? "未抽出"}</span>
    </div>
  );
}
