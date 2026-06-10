// =============================================================
// 通知（設計スタブ）  src/lib/notify.ts
// メール / LINE / Slack 等への実送信は「後で」。ここでは
//   - 通知チャネル・トリガ条件の型
//   - 「どの候補を通知すべきか」を選定するロジック（純関数）
//   - 実送信のための差し込み口（dispatchNotifications：現状は no-op）
// だけを先に用意する。runtime には未配線（将来 /api/discovery/run の最後で呼ぶ想定）。
// =============================================================

import type { ExtractedGrantCandidate, BusinessProfile, DiscoveredItem } from "./types";
import { scoreCandidateAgainstProfiles } from "./discovery";
import { daysUntil } from "./utils";

export type NotifyChannel = "email" | "line" | "slack" | "calendar";

// 通知の発火条件（仕様の通知条件に対応）
export type NotifyTrigger =
  | "high_affinity" // match_score 80点以上
  | "deadline_soon" // 締切30日以内
  | "pre_application_ng" // 申請前着手NGの可能性
  | "professional_check" // 士業確認推奨
  | "new"; // 新着

export type NotifyConfig = {
  enabled: boolean;
  channels: NotifyChannel[]; // 送信先（未設定なら送らない）
  minScore: number; // 高相性とみなすしきい値（既定80）
  deadlineDays: number; // 締切何日以内を対象にするか（既定30）
};

export const DEFAULT_NOTIFY_CONFIG: NotifyConfig = {
  enabled: false, // 既定OFF（実送信は未実装のため）
  channels: [],
  minScore: 80,
  deadlineDays: 30,
};

export type NotifyItem = {
  candidate_id: string;
  title: string;
  triggers: NotifyTrigger[];
  best_score: number;
  best_profile: string;
  deadline: string | null;
  url: string | null;
};

/**
 * 通知すべき候補を選定する純関数（送信はしない）。
 * 高相性 / 締切間近 / 申請前着手NG / 士業確認 のいずれかに該当する候補を返す。
 */
export function selectNotifiable(
  candidates: ExtractedGrantCandidate[],
  profiles: BusinessProfile[],
  config: NotifyConfig = DEFAULT_NOTIFY_CONFIG
): NotifyItem[] {
  const out: NotifyItem[] = [];
  for (const c of candidates) {
    const { bestScore, bestProfile } = scoreCandidateAgainstProfiles(c, profiles);
    const d = daysUntil(c.deadline);
    const triggers: NotifyTrigger[] = [];
    if (bestScore >= config.minScore) triggers.push("high_affinity");
    if (d != null && d >= 0 && d <= config.deadlineDays) triggers.push("deadline_soon");
    if (c.pre_application_ng_risk) triggers.push("pre_application_ng");
    if (c.professional_check_recommended) triggers.push("professional_check");
    if (triggers.length === 0) continue;
    out.push({
      candidate_id: c.id,
      title: c.name ?? "（名称未抽出）",
      triggers,
      best_score: bestScore,
      best_profile: bestProfile,
      deadline: c.deadline,
      url: c.official_url ?? null,
    });
  }
  // 高相性→締切が近い順
  return out.sort((a, b) => b.best_score - a.best_score || (daysUntil(a.deadline) ?? 9999) - (daysUntil(b.deadline) ?? 9999));
}

/**
 * 自動照合済みの discovered_items（match_score / extracted_deadline 付与済み）から通知候補を生成する。
 * runAll が付けたスコアをそのまま使うので、プロフィール再計算は不要（将来 /api/discovery/run の最後で呼ぶ想定）。
 */
export function selectNotifiableFromDiscovered(
  items: DiscoveredItem[],
  config: NotifyConfig = DEFAULT_NOTIFY_CONFIG
): NotifyItem[] {
  const out: NotifyItem[] = [];
  for (const i of items) {
    if (i.status === "imported" || i.status === "rejected") continue;
    const score = i.match_score ?? 0;
    const d = daysUntil(i.extracted_deadline ?? null);
    const triggers: NotifyTrigger[] = [];
    if (score >= config.minScore) triggers.push("high_affinity");
    if (d != null && d >= 0 && d <= config.deadlineDays) triggers.push("deadline_soon");
    if (triggers.length === 0) continue;
    out.push({
      candidate_id: i.id,
      title: i.title ?? "（無題）",
      triggers,
      best_score: score,
      best_profile: i.match_profile ?? "",
      deadline: i.extracted_deadline ?? null,
      url: i.official_url ?? i.url ?? null,
    });
  }
  return out.sort((a, b) => b.best_score - a.best_score || (daysUntil(a.deadline) ?? 9999) - (daysUntil(b.deadline) ?? 9999));
}

/**
 * 実送信の差し込み口（設計スタブ）。現状は送信せず、選定結果の件数だけ返す。
 * 将来：config.channels に応じて email/LINE/Slack/カレンダーへ送信し、
 *       送信済みは notification_log（discovery_notify_schema.sql）で重複送信を防ぐ。
 */
export async function dispatchNotifications(
  items: NotifyItem[],
  config: NotifyConfig = DEFAULT_NOTIFY_CONFIG
): Promise<{ selected: number; sent: number; skipped: number; channels: NotifyChannel[] }> {
  // 実送信は未実装（後日）。enabled かつ channels 設定時のみ将来送る。
  return { selected: items.length, sent: 0, skipped: items.length, channels: config.enabled ? config.channels : [] };
}

// 実送信スタブ（将来：メール / LINE / Slack）。現状は送信せず内容を返すのみ。
//   想定 .env：
//     NOTIFICATION_ENABLED=true|false
//     NOTIFICATION_EMAIL_TO=...
//     LINE_CHANNEL_ACCESS_TOKEN=...
//     LINE_USER_ID=...
export type SendableNotification = {
  title: string | null;
  message: string | null;
  official_url: string | null;
  notification_type: string;
};
export async function sendNotification(
  n: SendableNotification
): Promise<{ ok: boolean; channel: NotifyChannel | "none"; skipped?: boolean; reason?: string }> {
  const enabled = process.env.NOTIFICATION_ENABLED === "true";
  if (!enabled) return { ok: true, channel: "none", skipped: true, reason: "NOTIFICATION_ENABLED が未設定（送信は将来実装）" };
  // TODO: メール（NOTIFICATION_EMAIL_TO）／LINE（LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID）への送信を実装。
  //   現状は設計のみ。送信処理を追加してもこの関数の戻り値契約を保つこと。
  void n;
  return { ok: false, channel: "none", reason: "送信処理は未実装です" };
}
