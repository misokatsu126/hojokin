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
} from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。.env.local を確認してください。"
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "");

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
