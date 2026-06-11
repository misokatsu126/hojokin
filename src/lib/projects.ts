// 支出案件（Spending Project）：このツールの新しい主語。
//   ユーザーは「補助金名」ではなく「この支出に使える補助金があるか」を知りたい。
//   案件を登録し、案件 × 補助金 で候補を判定する。
//   MVP はブラウザの localStorage に保存（SQL不要で即動作。将来サーバ同期に拡張可能）。

import type { BusinessProfile, DiscoveredItem } from "./types";
import { expandQuery, expandRegions } from "./synonyms";
import { triageDiscovered, TRIAGE_ORDER, type TriageKey, type TriageResult } from "./triage";
import { isSampleDiscovered } from "./sampleFilter";

export type OrderStatus = "none" | "estimate" | "contract" | "ordered" | "paid";
export type Urgency = "low" | "mid" | "high";

export type SpendingProject = {
  id: string;
  name: string; // 案件名（例：岐阜店 空調入替）
  purpose: string; // 何にお金を使いたいか（自由記述）
  uses: string[]; // 用途タグ
  store: string; // 対象店舗・事業
  location: string; // 所在地
  entity: string; // 法人種別
  industry: string; // 業種
  employees: number | null; // 従業員数
  budget: number | null; // 予算（円）
  schedule: string; // 実施予定時期
  orderStatus: OrderStatus; // 見積/契約/発注/支払い
  urgency: Urgency;
  memo: string;
  checklist: Record<string, boolean>; // 申請準備チェック
  created_at: string;
  updated_at: string;
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  none: "まだ何もしていない",
  estimate: "見積だけ取った",
  contract: "契約した",
  ordered: "発注した",
  paid: "支払い済み",
};

export const URGENCY_LABEL: Record<Urgency, string> = { low: "ゆっくり", mid: "ふつう", high: "急ぎ" };

// 用途タグ（相談ウィザードと共通の言い回し。synonyms 辞書が反応する語）
export const PURPOSE_TAGS = [
  "空調を入れ替えたい", "店舗を改装したい", "看板を作りたい", "ホームページを作りたい",
  "ECを強化したい", "AI・在庫管理・POSを入れたい", "広告を出したい", "イベントを開催したい",
  "人を採用したい", "研修したい", "新店舗を出したい", "省エネ設備を入れたい", "セキュリティを強化したい",
];

export const PROJECT_CHECKLIST: { key: string; label: string }[] = [
  { key: "pre_order", label: "発注前か確認した" },
  { key: "guideline", label: "公式の公募要領を確認した" },
  { key: "expense", label: "対象経費を確認した" },
  { key: "area", label: "対象地域を確認した" },
  { key: "employees", label: "従業員数の要件を確認した" },
  { key: "gbizid", label: "GビズIDを確認した" },
  { key: "estimate", label: "見積書を取得した" },
  { key: "shokokai", label: "商工会議所に相談した" },
  { key: "pro", label: "士業（社労士・行政書士等）に確認した" },
  { key: "deadline", label: "申請締切を確認した" },
];

// 発注してよいか / 待つべきか
export function orderAdvice(s: OrderStatus): { wait: boolean; tone: string; title: string; text: string } {
  if (s === "none" || s === "estimate") {
    return {
      wait: true,
      tone: "border-green-200 bg-green-50 text-green-800",
      title: s === "none" ? "まだ発注しないでください（申請できる可能性があります）" : "契約・発注の前に確認しましょう（まだ間に合う可能性）",
      text: "補助金は交付決定前の契約・発注・支払いが対象外になることが多いです。先に公式の公募要領を確認してください。",
    };
  }
  return {
    wait: false,
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    title: "この経費は対象外の可能性があります",
    text: "すでに契約・発注・支払い済みの経費は対象外になる可能性があります。ただし、追加経費・別の経費・次回公募で使える可能性はあります。",
  };
}

// ---- localStorage ストア ----
const KEY = "spending_projects_v1";

export function loadProjects(): SpendingProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SpendingProject[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(list: SpendingProject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("projects-changed"));
}

export function getProject(id: string): SpendingProject | null {
  return loadProjects().find((p) => p.id === id) ?? null;
}

export function newProjectId(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function emptyProject(): SpendingProject {
  const now = new Date().toISOString();
  return {
    id: newProjectId(), name: "", purpose: "", uses: [], store: "", location: "", entity: "", industry: "",
    employees: null, budget: null, schedule: "", orderStatus: "none", urgency: "mid", memo: "",
    checklist: {}, created_at: now, updated_at: now,
  };
}

export function upsertProject(p: SpendingProject): SpendingProject {
  const list = loadProjects();
  const idx = list.findIndex((x) => x.id === p.id);
  const saved = { ...p, updated_at: new Date().toISOString() };
  if (idx >= 0) list[idx] = saved;
  else list.unshift(saved);
  persist(list);
  return saved;
}

export function deleteProject(id: string) {
  persist(loadProjects().filter((p) => p.id !== id));
}

// ---- 案件 → 仮想の事業プロフィール（案件×補助金 判定の入力） ----
export function projectToProfile(p: SpendingProject): BusinessProfile {
  const text = `${p.name} ${p.purpose} ${p.uses.join(" ")} ${p.industry} ${p.store}`;
  const ex = expandQuery(text);
  const regions = Array.from(new Set([...expandRegions(p.location), ...expandRegions(p.store), ...expandRegions(p.name)]));
  const now = new Date().toISOString();
  return {
    id: `project:${p.id}`,
    name: p.name || "支出案件",
    entity_type: p.entity || null,
    location: p.location || null,
    regions,
    industries: Array.from(new Set([...(p.industry ? [p.industry] : []), ...ex.industries])),
    description: p.purpose || null,
    purposes: ex.purposes,
    expenses: ex.expenses,
    keywords: Array.from(new Set([...ex.keywords, ...p.uses])),
    exclude_keywords: [],
    desired_amount: p.budget,
    notes: p.memo || null,
    created_at: now,
    updated_at: now,
  };
}

// ---- 案件 × 補助金 のトリアージ ----
export type ProjectMatch = {
  grouped: Map<TriageKey, { item: DiscoveredItem; r: TriageResult }[]>;
  top: { item: DiscoveredItem; r: TriageResult } | null; // 最有力候補
  total: number;
  missRisk: "高" | "中" | "低"; // 見逃しリスク
};

export function classifyForProject(project: SpendingProject, items: DiscoveredItem[]): ProjectMatch {
  const profile = projectToProfile(project);
  const active = items.filter(
    (i) => !isSampleDiscovered(i) && i.status !== "rejected" && i.status !== "ignored" && i.status !== "imported"
  );
  const grouped = new Map<TriageKey, { item: DiscoveredItem; r: TriageResult }[]>();
  let total = 0;
  for (const item of active) {
    const r = triageDiscovered(item, [profile]);
    // 案件と無関係（スコア0かつ地域/用途ヒットなし）は除外して候補を絞る
    if (r.score === 0 && r.key !== "missed" && r.key !== "deadline") continue;
    if (!grouped.has(r.key)) grouped.set(r.key, []);
    grouped.get(r.key)!.push({ item, r });
    total++;
  }
  for (const [, arr] of grouped) arr.sort((a, b) => b.r.score - a.r.score);

  // 最有力候補（usable→conditional→deadline→missed→next_time の順で先頭）
  let top: { item: DiscoveredItem; r: TriageResult } | null = null;
  for (const k of TRIAGE_ORDER) {
    const arr = grouped.get(k);
    if (arr && arr.length) { top = arr[0]; break; }
  }

  // 見逃しリスク：案件の情報が少ないほど高い
  const filled = [project.location, project.entity, project.industry, project.budget != null, project.uses.length > 0].filter(Boolean).length;
  const missRisk = filled <= 2 ? "高" : filled <= 3 ? "中" : "低";

  return { grouped, top, total, missRisk };
}
