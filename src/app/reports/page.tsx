"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchProfiles,
  fetchGrants,
  fetchDiscoveredItems,
  fetchExtractedCandidates,
} from "@/lib/supabase";
import type { BusinessProfile, Grant, DiscoveredItem, ExtractedGrantCandidate } from "@/lib/types";
import { ruleMatch } from "@/lib/matching";
import { scoreDiscoveredAgainstProfiles, scoreCandidateAgainstProfiles, suggestNextActions, ruleExtract } from "@/lib/discovery";
import { isSampleGrant, isSampleDiscovered } from "@/lib/sampleFilter";
import { daysUntil } from "@/lib/utils";
import { ReportView, type ReportItem } from "@/components/ReportView";

function notExpired(deadline: string | null): boolean {
  const d = daysUntil(deadline);
  return d == null || d >= 0;
}

export default function ReportsPage() {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [candidates, setCandidates] = useState<ExtractedGrantCandidate[]>([]);
  const [profileId, setProfileId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [generated, setGenerated] = useState<{ name: string; at: string; items: ReportItem[]; org: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") setOrgName(localStorage.getItem("report_org_name") ?? "");
  }, []);

  useEffect(() => {
    Promise.all([fetchProfiles(), fetchGrants(), fetchDiscoveredItems(), fetchExtractedCandidates()])
      .then(([p, g, it, c]) => {
        setProfiles(p);
        setGrants(g);
        setItems(it);
        setCandidates(c);
        if (p.length) setProfileId(p[0].id);
      })
      .catch((e) => setError(e.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const profile = useMemo(() => profiles.find((p) => p.id === profileId) ?? null, [profiles, profileId]);

  function build() {
    if (!profile) return;
    const out: ReportItem[] = [];

    // 管理対象に登録済み grants
    for (const g of grants) {
      if (isSampleGrant(g)) continue;
      if (!notExpired(g.application_deadline)) continue;
      const m = ruleMatch(g, profile);
      if (m.match_score < 60) continue;
      out.push({
        kind: "grant",
        kindLabel: "管理対象に登録済み",
        title: g.name,
        source: g.organization || "登録済み",
        regions: g.regions,
        amount: g.max_amount,
        rate: g.subsidy_rate,
        deadline: g.application_deadline,
        score: m.match_score,
        reason: m.matched_reasons.slice(0, 2).join("／"),
        concerns: m.exclusion_risks[0] ?? "",
        nextActions: m.next_actions.slice(0, 3),
        url: g.official_url,
      });
    }

    // 見つかった補助金 discovered_items
    for (const it of items) {
      if (isSampleDiscovered(it)) continue;
      if (it.status === "rejected" || it.status === "ignored" || it.status === "imported") continue;
      const sc = scoreDiscoveredAgainstProfiles(it, [profile]);
      if (sc.bestScore < 60) continue;
      const ex = ruleExtract(it);
      if (!notExpired(ex.deadline)) continue;
      out.push({
        kind: "discovered",
        kindLabel: "見つかった補助金（未確認）",
        title: it.title ?? "（無題）",
        source: it.external_source === "jnet21" ? "J-Net21" : it.external_source === "mirasapo" ? "ミラサポplus" : it.external_source ?? "自動収集",
        regions: ex.target_regions,
        amount: ex.max_amount,
        rate: ex.subsidy_rate,
        deadline: ex.deadline,
        score: sc.bestScore,
        reason: sc.reason,
        concerns: ex.pre_application_ng_risk ? "交付決定前の着手が対象外の可能性" : "",
        nextActions: suggestNextActions(it),
        url: it.official_url ?? it.url,
      });
    }

    // 整理済み候補 extracted_grant_candidates
    for (const c of candidates) {
      if (!notExpired(c.deadline)) continue;
      const sc = scoreCandidateAgainstProfiles(c, [profile]);
      if (sc.bestScore < 60) continue;
      out.push({
        kind: "candidate",
        kindLabel: "整理済み候補",
        title: c.name ?? "（名称未抽出）",
        source: c.organizer || "AI抽出",
        regions: c.target_regions ?? [],
        amount: c.max_amount,
        rate: c.subsidy_rate,
        deadline: c.deadline,
        score: sc.bestScore,
        reason: "",
        concerns: c.pre_application_ng_risk ? "交付決定前の着手が対象外の可能性" : "",
        nextActions: c.professional_check_recommended ? ["公募要領を確認", "専門家（士業）へ相談"] : ["公募要領を確認", "対象経費を確認"],
        url: c.official_url ?? c.official_pdf_url,
      });
    }

    out.sort((a, b) => b.score - a.score);
    if (typeof window !== "undefined") localStorage.setItem("report_org_name", orgName);
    setGenerated({ name: profile.name, at: new Date().toLocaleDateString("ja-JP"), items: out, org: orgName });
  }

  if (loading) return <p className="py-12 text-center text-gray-400">読み込み中…</p>;

  return (
    <div>
      <div className="no-print">
        <h1 className="mb-2 text-xl font-bold text-ink">お客様向けレポート</h1>
        <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          事業（顧客）を選んで「レポート作成」を押すと、その事業に合いそうな補助金（相性60点以上・締切前）を一覧にします。「印刷 / PDF保存」でそのまま渡せます。
        </p>

        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {profiles.length === 0 ? (
          <p className="rounded-lg border bg-white p-8 text-center text-gray-400">
            事業プロフィールがありません。<a href="/setup" className="text-accent hover:underline">初期設定</a>で登録してください。
          </p>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="自社名・作成者（任意）" className="rounded-md border px-3 py-2 text-sm" />
            <button onClick={build} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90">レポート作成</button>
            {generated && (
              <button onClick={() => window.print()} className="rounded-md border px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">印刷 / PDF保存</button>
            )}
          </div>
        )}
      </div>

      {generated && <ReportView profileName={generated.name} generatedAt={generated.at} items={generated.items} orgName={generated.org} />}
    </div>
  );
}
