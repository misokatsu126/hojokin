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
      title: "発注のあとなので要注意", detail: "この費用は対象外になることがあります。別の費用や次回の募集で使えないか確認しましょう。" });
  } else if (!c["pre_order"]) {
    out.push({ ...base, key: `${p.id}:pre_order`, kind: "pre_order", severity: "high",
      title: "発注の前に確認しましょう",
      detail: p.orderStatus === "estimate" ? "まだ見積もり段階です。契約・注文・支払いの前に、公式サイトで条件を確認しましょう。" : "契約・注文する前に、補助金が使えるか公式サイトで条件を確認しましょう。",
      taskKey: "pre_order" });
  }

  const dd = match?.top ? match.top.r.lc.deadlineDays : null;
  if (dd != null && dd >= 0 && dd <= 14 && !c["deadline"]) {
    out.push({ ...base, key: `${p.id}:deadline_soon`, kind: "deadline_soon", severity: "high",
      title: `締切まであと${dd}日です`, detail: "締切と「対象になる費用」を、早めに公式サイトで確認しましょう。",
      taskKey: "deadline", deadlineDays: dd });
  }

  const isIT = hasCore("it_donyu") || ["ai_pos", "ec", "website"].includes(p.templateKey ?? "");
  if (isIT && !c["gbizid"]) {
    out.push({ ...base, key: `${p.id}:gbizid`, kind: "gbizid", severity: "medium",
      title: "GビズIDの準備を", detail: "IT・DX系の補助金で必要になります。取得に時間がかかることがあるので早めに。", taskKey: "gbizid" });
  }

  const needConsult = hasCore("jizokuka") || cores.some((x) => x.group === "labor_grant");
  if (needConsult && !c["shokokai"] && !c["pro"]) {
    out.push({ ...base, key: `${p.id}:consult`, kind: "consult", severity: "medium",
      title: "先に相談しておきましょう", detail: "この種類の補助金は、商工会議所や社労士への事前相談・事前の計画が必要なことがあります。",
      taskKey: hasCore("jizokuka") ? "shokokai" : "pro" });
  }

  // 見積は物品・工事・委託系のみ（採用・研修など人件費系は対象外）
  const estimateRelevant = !["hire", "training"].includes(p.templateKey ?? "");
  if (!ordered && estimateRelevant && !c["estimate"]) {
    out.push({ ...base, key: `${p.id}:estimate`, kind: "estimate", severity: "medium",
      title: "見積もりをとりましょう", detail: "多くの補助金で見積書の提出が必要になります。", taskKey: "estimate" });
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
