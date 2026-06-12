import { createClient } from "@supabase/supabase-js";
import type {
  Grant,
  GrantInput,
  BusinessProfile,
  BusinessProfileInput,
  WatchCondition,
  GrantMatch,
  Alert,
  AppStatusRow,
  StatusNote,
  MatchResult,
  SourceSite,
  SourceSiteInput,
  DiscoveredItem,
  DiscoveredItemInput,
  ExtractedGrantCandidate,
  ExtractedGrantCandidateInput,
  ImportReview,
  SourceFetchLog,
  ApplicationChecklist,
  NotificationCandidate,
} from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。.env.local を確認してください。"
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "");

// Supabase が設定済みか（未設定なら localStorage のみで動作する）
export const supabaseConfigured = Boolean(url && anonKey);

// ---------------- spending_projects（支出案件） ----------------
// 案件のクラウド保存。row は snake_case（DB列）。ドメイン変換は projects.ts 側で行う。
export type SpendingProjectRow = {
  id: string;
  name?: string | null;
  purpose?: string | null;
  uses?: unknown;
  store?: string | null;
  location?: string | null;
  entity?: string | null;
  industry?: string | null;
  employees?: number | null;
  budget?: number | null;
  schedule?: string | null;
  order_status?: string | null;
  urgency?: string | null;
  memo?: string | null;
  checklist?: unknown;
  template_key?: string | null;
  answers?: unknown;
  core_checks?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function fetchSpendingProjectRows(): Promise<SpendingProjectRow[]> {
  const { data, error } = await supabase
    .from("spending_projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SpendingProjectRow[];
}

export async function upsertSpendingProjectRow(row: SpendingProjectRow): Promise<void> {
  const { error } = await supabase.from("spending_projects").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteSpendingProjectRow(id: string): Promise<void> {
  const { error } = await supabase.from("spending_projects").delete().eq("id", id);
  if (error) throw error;
}


// ---------------- grants ----------------
export async function fetchGrants(): Promise<Grant[]> {
  const { data, error } = await supabase
    .from("grants")
    .select("*")
    .order("application_deadline", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Grant[];
}

export async function fetchGrant(id: string): Promise<Grant | null> {
  const { data, error } = await supabase.from("grants").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Grant) ?? null;
}

export async function createGrant(input: GrantInput): Promise<Grant> {
  const { data, error } = await supabase.from("grants").insert(input).select().single();
  if (error) throw error;
  return data as Grant;
}

export async function updateGrant(id: string, input: Partial<GrantInput>): Promise<Grant> {
  const { data, error } = await supabase.from("grants").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data as Grant;
}

export async function deleteGrant(id: string): Promise<void> {
  const { error } = await supabase.from("grants").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- business_profiles ----------------
export async function fetchProfiles(): Promise<BusinessProfile[]> {
  const { data, error } = await supabase
    .from("business_profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BusinessProfile[];
}

export async function createProfile(input: BusinessProfileInput): Promise<BusinessProfile> {
  const { data, error } = await supabase.from("business_profiles").insert(input).select().single();
  if (error) throw error;
  return data as BusinessProfile;
}

export async function updateProfile(
  id: string,
  input: Partial<BusinessProfileInput>
): Promise<BusinessProfile> {
  const { data, error } = await supabase
    .from("business_profiles")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as BusinessProfile;
}

export async function deleteProfile(id: string): Promise<void> {
  const { error } = await supabase.from("business_profiles").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- watch_conditions ----------------
export async function fetchWatchConditions(): Promise<WatchCondition[]> {
  const { data, error } = await supabase.from("watch_conditions").select("*");
  if (error) throw error;
  return (data ?? []) as WatchCondition[];
}

export async function upsertWatchCondition(
  profileId: string,
  cond: Partial<WatchCondition>,
  existingId?: string
): Promise<WatchCondition> {
  if (existingId) {
    const { data, error } = await supabase
      .from("watch_conditions")
      .update({ ...cond, profile_id: profileId })
      .eq("id", existingId)
      .select()
      .single();
    if (error) throw error;
    return data as WatchCondition;
  }
  const { data, error } = await supabase
    .from("watch_conditions")
    .insert({ ...cond, profile_id: profileId })
    .select()
    .single();
  if (error) throw error;
  return data as WatchCondition;
}

// ---------------- grant_matches ----------------
export async function fetchMatches(): Promise<GrantMatch[]> {
  const { data, error } = await supabase.from("grant_matches").select("*");
  if (error) throw error;
  return (data ?? []) as GrantMatch[];
}

export async function fetchMatchesForGrant(grantId: string): Promise<GrantMatch[]> {
  const { data, error } = await supabase.from("grant_matches").select("*").eq("grant_id", grantId);
  if (error) throw error;
  return (data ?? []) as GrantMatch[];
}

// ---------------- alerts ----------------
export async function fetchAlerts(): Promise<Alert[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Alert[];
}

export async function markAlertRead(id: string, isRead: boolean): Promise<void> {
  const { error } = await supabase.from("alerts").update({ is_read: isRead }).eq("id", id);
  if (error) throw error;
}

// ---------------- application_statuses ----------------
export async function fetchStatuses(): Promise<AppStatusRow[]> {
  const { data, error } = await supabase.from("application_statuses").select("*");
  if (error) throw error;
  return (data ?? []) as AppStatusRow[];
}

export async function setStatus(
  grantId: string,
  profileId: string,
  status: string
): Promise<AppStatusRow> {
  const { data, error } = await supabase
    .from("application_statuses")
    .upsert(
      { grant_id: grantId, profile_id: profileId, status },
      { onConflict: "grant_id,profile_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as AppStatusRow;
}

// ---------------- status_notes ----------------
export async function fetchNotes(grantId: string, profileId: string): Promise<StatusNote[]> {
  const { data, error } = await supabase
    .from("status_notes")
    .select("*")
    .eq("grant_id", grantId)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StatusNote[];
}

export async function addNote(
  grantId: string,
  profileId: string,
  note: string,
  status?: string
): Promise<StatusNote> {
  const { data, error } = await supabase
    .from("status_notes")
    .insert({ grant_id: grantId, profile_id: profileId, note, status: status ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as StatusNote;
}

// ---------------- ai_search_logs ----------------
export async function logSearch(
  query: string,
  interpreted: unknown,
  resultCount: number
): Promise<void> {
  const { error } = await supabase
    .from("ai_search_logs")
    .insert({ query, interpreted_conditions: interpreted, result_count: resultCount });
  if (error) console.warn("[ai_search_logs] insert failed:", error.message);
}

// =============================================================
// 自動探索レーダー：情報源・検知候補・AI抽出候補・確認履歴
// =============================================================

// ---------------- source_sites ----------------
export async function fetchSourceSites(): Promise<SourceSite[]> {
  const { data, error } = await supabase
    .from("source_sites")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SourceSite[];
}

export async function createSourceSite(input: SourceSiteInput): Promise<SourceSite> {
  const { data, error } = await supabase.from("source_sites").insert(input).select().single();
  if (error) throw error;
  return data as SourceSite;
}

export async function updateSourceSite(
  id: string,
  input: Partial<SourceSiteInput>
): Promise<SourceSite> {
  const { data, error } = await supabase
    .from("source_sites")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SourceSite;
}

export async function deleteSourceSite(id: string): Promise<void> {
  const { error } = await supabase.from("source_sites").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- discovered_items ----------------
export async function fetchDiscoveredItems(): Promise<DiscoveredItem[]> {
  const { data, error } = await supabase
    .from("discovered_items")
    .select("*")
    .order("detected_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DiscoveredItem[];
}

export async function fetchDiscoveredItem(id: string): Promise<DiscoveredItem | null> {
  const { data, error } = await supabase
    .from("discovered_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as DiscoveredItem) ?? null;
}

export async function createDiscoveredItem(
  input: DiscoveredItemInput
): Promise<DiscoveredItem> {
  const { data, error } = await supabase.from("discovered_items").insert(input).select().single();
  if (error) throw error;
  return data as DiscoveredItem;
}

export async function updateDiscoveredItem(
  id: string,
  input: Partial<DiscoveredItemInput>
): Promise<DiscoveredItem> {
  const { data, error } = await supabase
    .from("discovered_items")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DiscoveredItem;
}

export async function deleteDiscoveredItem(id: string): Promise<void> {
  const { error } = await supabase.from("discovered_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- extracted_grant_candidates ----------------
export async function fetchExtractedCandidates(): Promise<ExtractedGrantCandidate[]> {
  const { data, error } = await supabase
    .from("extracted_grant_candidates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExtractedGrantCandidate[];
}

export async function fetchExtractedForItem(
  discoveredItemId: string
): Promise<ExtractedGrantCandidate[]> {
  const { data, error } = await supabase
    .from("extracted_grant_candidates")
    .select("*")
    .eq("discovered_item_id", discoveredItemId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExtractedGrantCandidate[];
}

export async function createExtractedCandidate(
  input: ExtractedGrantCandidateInput
): Promise<ExtractedGrantCandidate> {
  const { data, error } = await supabase
    .from("extracted_grant_candidates")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ExtractedGrantCandidate;
}

export async function deleteExtractedCandidate(id: string): Promise<void> {
  const { error } = await supabase.from("extracted_grant_candidates").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- import_reviews ----------------
export async function fetchImportReviews(): Promise<ImportReview[]> {
  const { data, error } = await supabase
    .from("import_reviews")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ImportReview[];
}

export async function createImportReview(input: {
  extracted_grant_candidate_id: string;
  reviewer_name?: string | null;
  review_status: string;
  review_note?: string | null;
  approved_grant_id?: string | null;
}): Promise<ImportReview> {
  const { data, error } = await supabase.from("import_reviews").insert(input).select().single();
  if (error) throw error;
  return data as ImportReview;
}

// ---------------- 自動収集（Jグランツ/巡回/RSS）用 ----------------

export async function fetchSourceSite(id: string): Promise<SourceSite | null> {
  const { data, error } = await supabase.from("source_sites").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as SourceSite) ?? null;
}

// 外部ソースの一意キー（external_id）で discovered_items を upsert（重複防止）
// external_id で既存の検知候補が存在するか（詳細取得を新規分だけに限定する判定用）
export async function discoveredExists(externalId: string): Promise<boolean> {
  const { data } = await supabase
    .from("discovered_items")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return Boolean(data);
}

// 外部ソースの一意キー（external_id）で discovered_items を upsert（同一源内の重複防止）
export async function upsertDiscoveredByExternal(
  row: Partial<DiscoveredItemInput> & { external_id: string }
): Promise<{ inserted: boolean; id: string | null }> {
  // 既存チェック（更新時に detected_at を保持したいので存在確認してから分岐）
  const { data: existing } = await supabase
    .from("discovered_items")
    .select("id")
    .eq("external_id", row.external_id)
    .maybeSingle();
  if (existing) {
    const { data: updated } = await supabase
      .from("discovered_items")
      .update(row)
      .eq("external_id", row.external_id)
      .select("id")
      .maybeSingle();
    return { inserted: false, id: (updated as any)?.id ?? (existing as any).id };
  }
  const { data: inserted, error } = await supabase
    .from("discovered_items")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return { inserted: true, id: (inserted as any)?.id ?? null };
}

// 情報源をまたいだ重複検知：正規化キーが一致/酷似する既存候補を返す（自分自身は除外）
export async function findDiscoveredByNormalizedKey(
  normalizedKey: string,
  excludeId?: string | null
): Promise<{ id: string; external_source: string | null; duplicate_of: string | null }[]> {
  if (!normalizedKey) return [];
  const { data } = await supabase
    .from("discovered_items")
    .select("id, external_source, duplicate_of, normalized_key")
    .eq("normalized_key", normalizedKey);
  const rows = (data ?? []) as any[];
  return rows
    .filter((r) => r.id !== excludeId)
    .map((r) => ({ id: r.id, external_source: r.external_source ?? null, duplicate_of: r.duplicate_of ?? null }));
}

// duplicate_of を設定（自動統合はせず重複候補として紐づけるだけ）
export async function setDiscoveredDuplicate(id: string, dupOfId: string | null): Promise<void> {
  await supabase.from("discovered_items").update({ duplicate_of: dupOfId }).eq("id", id);
}

// 既知URLの情報源を取得、無ければ作成（Jグランツ等の固定ソース用）
export async function findOrCreateSourceSite(
  match: { url: string },
  defaults: SourceSiteInput
): Promise<SourceSite> {
  const { data: found } = await supabase
    .from("source_sites")
    .select("*")
    .eq("url", match.url)
    .maybeSingle();
  if (found) return found as SourceSite;
  const { data, error } = await supabase.from("source_sites").insert(defaults).select().single();
  if (error) throw error;
  return data as SourceSite;
}

export async function createSourceFetchLog(row: {
  source_site_id: string | null;
  status: "success" | "error" | "skipped";
  http_status?: number | null;
  error_message?: string | null;
  detected_count?: number;
}): Promise<void> {
  const { error } = await supabase.from("source_fetch_logs").insert(row);
  if (error) console.warn("[source_fetch_logs] insert failed:", error.message);
}

export async function fetchRecentFetchLogs(limit = 50): Promise<SourceFetchLog[]> {
  const { data, error } = await supabase
    .from("source_fetch_logs")
    .select("*")
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SourceFetchLog[];
}

// ---------------- application_checklists（公式確認チェックリスト） ----------------
export async function fetchChecklistByDiscovered(
  discoveredItemId: string
): Promise<ApplicationChecklist | null> {
  const { data, error } = await supabase
    .from("application_checklists")
    .select("*")
    .eq("discovered_item_id", discoveredItemId)
    .maybeSingle();
  if (error) throw error;
  return (data as ApplicationChecklist) ?? null;
}

export async function upsertChecklist(
  discoveredItemId: string,
  patch: Partial<ApplicationChecklist>
): Promise<ApplicationChecklist> {
  const { data: existing } = await supabase
    .from("application_checklists")
    .select("id")
    .eq("discovered_item_id", discoveredItemId)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabase
      .from("application_checklists")
      .update(patch)
      .eq("discovered_item_id", discoveredItemId)
      .select()
      .single();
    if (error) throw error;
    return data as ApplicationChecklist;
  }
  const { data, error } = await supabase
    .from("application_checklists")
    .insert({ discovered_item_id: discoveredItemId, ...patch })
    .select()
    .single();
  if (error) throw error;
  return data as ApplicationChecklist;
}

// ---------------- notification_candidates（通知候補） ----------------
export async function fetchNotificationCandidates(
  status?: string
): Promise<NotificationCandidate[]> {
  let q = supabase.from("notification_candidates").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as NotificationCandidate[];
}

export async function updateNotificationStatus(
  id: string,
  status: "pending" | "sent" | "dismissed" | "failed"
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  const { error } = await supabase.from("notification_candidates").update(patch).eq("id", id);
  if (error) throw error;
}

// grant に紐づくチェックリスト（discovered_item_id は null）
export async function fetchChecklistByGrant(grantId: string): Promise<ApplicationChecklist | null> {
  const { data, error } = await supabase
    .from("application_checklists")
    .select("*")
    .eq("grant_id", grantId)
    .is("discovered_item_id", null)
    .maybeSingle();
  if (error) throw error;
  return (data as ApplicationChecklist) ?? null;
}

export async function upsertChecklistByGrant(
  grantId: string,
  patch: Partial<ApplicationChecklist>
): Promise<ApplicationChecklist> {
  const { data: existing } = await supabase
    .from("application_checklists")
    .select("id")
    .eq("grant_id", grantId)
    .is("discovered_item_id", null)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabase
      .from("application_checklists")
      .update(patch)
      .eq("id", (existing as any).id)
      .select()
      .single();
    if (error) throw error;
    return data as ApplicationChecklist;
  }
  const { data, error } = await supabase
    .from("application_checklists")
    .insert({ grant_id: grantId, ...patch })
    .select()
    .single();
  if (error) throw error;
  return data as ApplicationChecklist;
}

// ---------------- collect_settings（収集キーワード・地域） ----------------
export async function fetchCollectSettings(): Promise<{ keywords: string[]; regions: string[] } | null> {
  const { data, error } = await supabase.from("collect_settings").select("*").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { keywords: (data as any).keywords ?? [], regions: (data as any).regions ?? [] };
}

export async function saveCollectSettings(keywords: string[], regions: string[]): Promise<void> {
  const { data: existing } = await supabase.from("collect_settings").select("id").limit(1).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("collect_settings").update({ keywords, regions, updated_at: new Date().toISOString() }).eq("id", (existing as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("collect_settings").insert({ keywords, regions });
    if (error) throw error;
  }
}
