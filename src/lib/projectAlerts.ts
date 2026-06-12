// 案件ベースの通知・リマインド（在席中の画面内通知）。
//   締切14日前 / 発注前未確認 / 発注済み注意 / GビズID未確認 / 見積未取得 / 事前相談未確認 を検出。
//   ※ 純粋関数として実装（将来メール/LINE送信を足すときも同じ判定を再利用できる）。
//   ※ 実送信はまだ無い。ここは「在席中に画面で気づける」ための通知。

import { classifyForProject, type SpendingProject, type ProjectMatch } from "./projects";
import { getCoreProgramChecks } from "./coreMaster";
import type { DiscoveredItem } from "./types";

export type AlertKind = "ordered_risk" | "deadline_soon" | "pre_order" | "gbizid" | "consult" | "estimate";
export type AlertSeverity = "high" | "medium";

export type ProjectAlert = {
  key: string; // projectId:kind（消し込みの識別子）
  projectId: string;
  projectName: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  taskKey?: string; // 案件詳細の該当タスクへ遷移（?task=）
  deadlineDays?: number | null;
};

export const ALERT_META: Record<AlertKind, { label: string; icon: string }> = {
  ordered_risk: { label: "発注後の注意", icon: "🔴" },
  deadline_soon: { label: "締切が近い", icon: "⏰" },
  pre_order: { label: "発注前の確認", icon: "🟠" },
  gbizid: { label: "GビズID", icon: "🆔" },
  consult: { label: "事前相談", icon: "🤝" },
  estimate: { label: "見積", icon: "📄" },
};

const KIND_RANK: Record<AlertKind, number> = {
  ordered_risk: 0, deadline_soon: 1, pre_order: 2, gbizid: 3, consult: 4, estimate: 5,
};

// 1案件分の通知を作る。match があれば締切系も判定する。
export function alertsForProject(p: SpendingProject, match?: ProjectMatch): ProjectAlert[] {
  const c = p.checklist ?? {};
  const cores = getCoreProgramChecks(p);
  const hasCore = (k: string) => cores.some((x) => x.key === k);
  const ordered = p.orderStatus === "contract" || p.orderStatus === "ordered" || p.orderStatus === "paid";
  const base = { projectId: p.id, projectName: p.name || "支出案件" };
  const out: ProjectAlert[] = [];

  if (ordered) {
    out.push({ ...base, key: `${p.id}:ordered_risk`, kind: "ordered_risk", severity: "high",
      title: "発注後の経費は対象外の可能性", detail: "別の経費・次回公募で使えないか確認しましょう。" });
  } else if (!c["pre_order"]) {
    out.push({ ...base, key: `${p.id}:pre_order`, kind: "pre_order", severity: "high",
      title: "発注前の確認が未完了",
      detail: p.orderStatus === "estimate" ? "見積段階です。契約・発注・支払い前に公式要領を確認してください。" : "発注前に公式の公募要領を確認してください。",
      taskKey: "pre_order" });
  }

  const dd = match?.top ? match.top.r.lc.deadlineDays : null;
  if (dd != null && dd >= 0 && dd <= 14 && !c["deadline"]) {
    out.push({ ...base, key: `${p.id}:deadline_soon`, kind: "deadline_soon", severity: "high",
      title: `締切が近い候補があります（あと${dd}日）`, detail: "締切・対象経費を公式要領で早めに確認してください。",
      taskKey: "deadline", deadlineDays: dd });
  }

  const isIT = hasCore("it_donyu") || ["ai_pos", "ec", "website"].includes(p.templateKey ?? "");
  if (isIT && !c["gbizid"]) {
    out.push({ ...base, key: `${p.id}:gbizid`, kind: "gbizid", severity: "medium",
      title: "GビズIDが未確認", detail: "IT・DX系補助金で必要です。取得に時間がかかることがあります。", taskKey: "gbizid" });
  }

  const needConsult = hasCore("jizokuka") || cores.some((x) => x.group === "labor_grant");
  if (needConsult && !c["shokokai"] && !c["pro"]) {
    out.push({ ...base, key: `${p.id}:consult`, kind: "consult", severity: "medium",
      title: "事前相談が未確認", detail: "商工会議所・社労士など、事前相談や事前計画が必要な制度があります。",
      taskKey: hasCore("jizokuka") ? "shokokai" : "pro" });
  }

  // 見積は物品・工事・委託系のみ（採用・研修など人件費系は対象外）
  const estimateRelevant = !["hire", "training"].includes(p.templateKey ?? "");
  if (!ordered && estimateRelevant && !c["estimate"]) {
    out.push({ ...base, key: `${p.id}:estimate`, kind: "estimate", severity: "medium",
      title: "見積が未取得", detail: "多くの補助金で見積書が必要になります。", taskKey: "estimate" });
  }

  return out;
}

function sortAlerts(list: ProjectAlert[]): ProjectAlert[] {
  return [...list].sort((a, b) => {
    const sev = (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1);
    if (sev !== 0) return sev;
    const k = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (k !== 0) return k;
    return (a.deadlineDays ?? 99) - (b.deadlineDays ?? 99);
  });
}

// 全案件の通知（締切判定のため discovered items を使う）
export function computeProjectAlerts(projects: SpendingProject[], items: DiscoveredItem[]): ProjectAlert[] {
  return sortAlerts(projects.flatMap((p) => alertsForProject(p, classifyForProject(p, items))));
}

// バッジ用の軽量版（items 不要＝締切系を除く案件内シグナルのみ）
export function countCaseAlerts(projects: SpendingProject[], dismissed: Set<string>): number {
  return projects.flatMap((p) => alertsForProject(p)).filter((a) => !dismissed.has(a.key)).length;
}

// ---- 消し込み（既読/対応済み）状態：localStorage ----
const DKEY = "project_alerts_dismissed_v1";

export function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DKEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DKEY, JSON.stringify([...set]));
  window.dispatchEvent(new Event("alerts-changed"));
}

export function dismissAlert(key: string) {
  const s = loadDismissed();
  s.add(key);
  persistDismissed(s);
}

export function restoreAlert(key: string) {
  const s = loadDismissed();
  s.delete(key);
  persistDismissed(s);
}
