import {
  supabase,
  upsertDiscoveredByExternal,
  discoveredExists,
  createSourceFetchLog,
  findOrCreateSourceSite,
  fetchSourceSites,
} from "./supabase";
import { htmlToText } from "./discovery";
import { regionTextInTarget, type AudienceType } from "./constants";
import type { SourceSite } from "./types";

// =============================================================
// 自動収集（合法ルートのみ）
//   - Jグランツ公開API（デジタル庁）: GET /exp/v1/public/subsidies, /subsidies/id/{id}
//   - 公式ページのサーバー側fetch（HTMLのリンク抽出。robots等で取れない場合はスキップ）
//   - 公開RSS/Atomフィードの購読
//   ※ 民間まとめサイトの自動スクレイピングは実装しない（方針）
// =============================================================

// 取得時のタイムアウト付き fetch。失敗してもアプリを落とさず ok:false を返す。
async function safeFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; text?: string; error?: string }> {
  const timeoutMs = init?.timeoutMs ?? 10000;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "HojokinRadar/1.0 (+contact: tool admin)",
        Accept: "application/json, text/html, application/xml;q=0.9, */*;q=0.8",
        ...(init?.headers ?? {}),
      },
    });
    clearTimeout(timer);
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    const err = e as Error;
    return { ok: false, status: 0, error: err.name === "AbortError" ? "timeout" : err.message };
  }
}

// 事業者向け / 個人向け の簡易判定（本文キーワード）
export function inferAudience(text: string): AudienceType {
  const t = text ?? "";
  const business = /(中小企業|小規模事業者|事業者|法人|個人事業主|創業|起業|スタートアップ|商工|販路|設備投資|生産性|事業再構築)/.test(t);
  // 「個人事業主」は事業者扱いなので、個人判定からは除外した語のみ
  const individual = /(個人(?!事業)|住民|県民|市民|町民|子育て|出産|育児|移住|定住|結婚|新婚|住宅|リフォーム|学生|奨学|求職|就職|高齢者|障害|介護|医療費)/.test(t);
  if (business && individual) return "both";
  if (business) return "business";
  if (individual) return "individual";
  return "unknown";
}

// ---------------- Jグランツ公開API ----------------
const JGRANTS_BASE = "https://api.jgrants-portal.go.jp/exp/v1/public";
const JGRANTS_PORTAL = "https://www.jgrants-portal.go.jp/subsidy";

// 対象地域×複数キーワードでループ検索するための既定キーワード
const JGRANTS_DEFAULT_KEYWORDS = [
  "補助金",
  "助成金",
  "IT",
  "DX",
  "省エネ",
  "創業",
  "販路",
  "設備",
];
// target_area_search に渡す地域（全国＋対象5地域）。空でも regionTextInTarget で再フィルタ。
const JGRANTS_AREAS = ["全国", "愛知県", "名古屋市", "弥富市", "岐阜県", "岐阜市"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type JgrantsListItem = {
  id?: string;
  name?: string;
  title?: string;
  target_area_search?: string;
  subsidy_max_limit?: number | null;
  acceptance_start_datetime?: string | null;
  acceptance_end_datetime?: string | null;
  target_number_of_employees?: string | null;
  institution_name?: string | null;
};

type JgrantsDetail = {
  subsidy_catch_phrase?: string | null;
  detail?: string | null;
  use_purpose?: string | null;
  industry?: string | null;
  target_area_detail?: string | null;
  subsidy_rate?: string | null;
  project_end_deadline?: string | null;
  front_subsidy_detail_page_url?: string | null;
};

// Jグランツ一覧API（keyword 必須・2〜255文字、sort/order/acceptance 必須、target_area_search 任意）
async function jgrantsSearch(keyword: string, targetArea?: string): Promise<JgrantsListItem[]> {
  const qs = new URLSearchParams({
    keyword,
    sort: "created_date",
    order: "DESC",
    acceptance: "1", // 募集中のみ
  });
  if (targetArea) qs.set("target_area_search", targetArea);
  const r = await safeFetch(`${JGRANTS_BASE}/subsidies?${qs.toString()}`, { timeoutMs: 12000 });
  if (!r.ok || !r.text) throw new Error(r.error ?? `HTTP ${r.status}`);
  let json: any;
  try {
    json = JSON.parse(r.text);
  } catch {
    throw new Error("JSON parse error");
  }
  const result = Array.isArray(json?.result) ? json.result : [];
  return result as JgrantsListItem[];
}

// Jグランツ詳細API（公式詳細ページURLや補助率・締切などを補完）。失敗時は null。
async function jgrantsDetail(id: string): Promise<JgrantsDetail | null> {
  const r = await safeFetch(`${JGRANTS_BASE}/subsidies/id/${encodeURIComponent(id)}`, { timeoutMs: 12000 });
  if (!r.ok || !r.text) return null;
  try {
    const json = JSON.parse(r.text);
    const d = Array.isArray(json?.result) ? json.result[0] : json?.result;
    return (d as JgrantsDetail) ?? null;
  } catch {
    return null;
  }
}

export type CollectSummary = {
  source: string;
  ok: boolean;
  inserted: number;
  updated: number;
  scanned: number;
  error?: string;
};

/**
 * Jグランツから対象地域×複数キーワードでループ検索し discovered_items に upsert する。
 * - 一覧APIで募集中の補助金を取得 → 対象地域で再フィルタ → upsert（external_id で重複排除）。
 * - 新規分は詳細APIで front_subsidy_detail_page_url・補助率・締切等を補完（件数上限あり）。
 * - レート制限に配慮し各リクエスト間に小待機。取得失敗時も throw せず ok:false を返す。
 */
export async function runJgrantsSync(opts?: {
  keywords?: string[];
  maxListCalls?: number;
  maxDetail?: number;
}): Promise<CollectSummary> {
  const summary: CollectSummary = { source: "jgrants", ok: true, inserted: 0, updated: 0, scanned: 0 };

  // Jグランツ用の情報源（source_sites）を用意（ログ紐づけ用）
  let site: SourceSite | null = null;
  try {
    site = await findOrCreateSourceSite(
      { url: "https://www.jgrants-portal.go.jp/" },
      {
        name: "Jグランツ（補助金電子申請システム・公開API）",
        source_type: "semi_official",
        trust_level: "B",
        url: "https://www.jgrants-portal.go.jp/",
        region: "全国",
        priority: "high",
        crawl_frequency: "daily",
        is_active: true,
        last_checked_at: null,
        notes: "デジタル庁 Jグランツ公開API（GET /exp/v1/public/subsidies）。認証不要。利用規約: https://www.jgrants-portal.go.jp/open-api",
      }
    );
  } catch {
    // source_sites が無い環境でも収集自体は継続（ログだけ諦める）
  }

  const keywords = opts?.keywords?.length ? opts.keywords : JGRANTS_DEFAULT_KEYWORDS;
  const maxListCalls = opts?.maxListCalls ?? 36;
  const maxDetail = opts?.maxDetail ?? 20;

  const seen = new Set<string>();
  let listCalls = 0;
  let callsTried = 0;
  let callsFailed = 0;
  let detailFetched = 0;
  let lastError = "";

  try {
    outer: for (const area of JGRANTS_AREAS) {
      for (const kw of keywords) {
        if (!kw || kw.length < 2) continue;
        if (listCalls >= maxListCalls) break outer;
        listCalls++;
        callsTried++;
        let items: JgrantsListItem[] = [];
        try {
          items = await jgrantsSearch(kw, area);
        } catch (e) {
          callsFailed++;
          lastError = (e as Error).message;
          await sleep(200);
          continue;
        }
        for (const it of items) {
          if (!it.id || seen.has(it.id)) continue;
          seen.add(it.id);
          summary.scanned++;
          // 対象地域でフィルタ（全国・空も対象）
          if (!regionTextInTarget(it.target_area_search)) continue;

          const name = (it.name || it.title || "").trim() || "（名称不明のJグランツ補助金）";
          const baseLines = [
            name,
            it.institution_name ? `実施機関: ${it.institution_name}` : "",
            it.target_area_search ? `対象地域: ${it.target_area_search}` : "",
            it.subsidy_max_limit != null ? `上限額: ${it.subsidy_max_limit}円` : "",
            it.acceptance_start_datetime ? `募集開始: ${it.acceptance_start_datetime}` : "",
            it.acceptance_end_datetime ? `締切: ${it.acceptance_end_datetime}` : "",
            it.target_number_of_employees ? `従業員規模: ${it.target_number_of_employees}` : "",
          ].filter(Boolean);

          const portalUrl = `${JGRANTS_PORTAL}/${it.id}`;
          let officialUrl = portalUrl;
          let pdfUrl: string | null = null;

          // 新規候補だけ詳細APIで補完（件数上限・小待機）
          const exists = await discoveredExists(`jgrants:${it.id}`);
          if (!exists && detailFetched < maxDetail) {
            detailFetched++;
            await sleep(150);
            const d = await jgrantsDetail(it.id);
            if (d) {
              if (d.front_subsidy_detail_page_url) officialUrl = d.front_subsidy_detail_page_url;
              if (d.subsidy_catch_phrase) baseLines.push(`概要: ${d.subsidy_catch_phrase}`);
              if (d.subsidy_rate) baseLines.push(`補助率: ${d.subsidy_rate}`);
              if (d.use_purpose) baseLines.push(`目的: ${d.use_purpose}`);
              if (d.industry) baseLines.push(`業種: ${d.industry}`);
              if (d.project_end_deadline) baseLines.push(`事業終了期限: ${d.project_end_deadline}`);
            }
          }

          const rawText = baseLines.join("\n");
          try {
            const { inserted } = await upsertDiscoveredByExternal({
              external_id: `jgrants:${it.id}`,
              external_source: "jgrants",
              source_site_id: site?.id ?? null,
              title: name,
              url: officialUrl,
              raw_text: rawText,
              raw_html: null,
              pdf_url: pdfUrl,
              detection_type: "new",
              status: "unreviewed",
              source_category: "semi_official",
              trust_level: "B",
              original_source_url: portalUrl,
              // Jグランツは公的ポータルなので公式URLとして扱う
              official_url: officialUrl,
              official_pdf_url: null,
              official_source_confirmed: true,
              source_warning: null,
              last_verified_at: null,
              verification_status: "official_found",
              duplicate_of: null,
              audience_type: inferAudience(rawText) === "unknown" ? "business" : inferAudience(rawText),
            });
            if (inserted) summary.inserted++;
            else summary.updated++;
          } catch {
            // 1件の保存失敗は無視して継続
          }
        }
        await sleep(200); // レート配慮
      }
    }
  } catch (e) {
    summary.ok = false;
    summary.error = (e as Error).message;
  }

  // 全リクエストで取得に失敗した場合は ok:false（外部到達不可・API障害を可視化）
  if (summary.ok && callsTried > 0 && callsFailed === callsTried) {
    summary.ok = false;
    summary.error = `Jグランツへの取得に全て失敗しました（${lastError || "ネットワーク不可"}）`;
  }

  if (site) {
    await createSourceFetchLog({
      source_site_id: site.id,
      status: summary.ok ? "success" : "error",
      detected_count: summary.inserted + summary.updated,
      error_message: summary.error ?? null,
    });
    try {
      await supabase.from("source_sites").update({ last_checked_at: new Date().toISOString() }).eq("id", site.id);
    } catch {
      /* noop */
    }
  }
  return summary;
}

// ---------------- 公式ページ巡回（リンク抽出） ----------------
const SUBSIDY_LINK_RE = /(補助金|助成金|給付金|支援金|補助|助成|奨励金)/;

function extractLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = htmlToText(m[2]).trim();
    if (!text || text.length < 4) continue;
    if (!SUBSIDY_LINK_RE.test(text)) continue;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    out.push({ href: abs, text });
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * 指定した公式ページ(source_sites.url)を取得し、補助金関連リンクを discovered_items に保存。
 * 取得失敗(robots/JS描画/タイムアウト)時は source_fetch_logs に error を記録しスキップ。
 */
export async function runCrawl(site: SourceSite): Promise<CollectSummary> {
  const summary: CollectSummary = { source: `crawl:${site.name}`, ok: true, inserted: 0, updated: 0, scanned: 0 };
  if (!site.url) {
    summary.ok = false;
    summary.error = "URL未設定";
    await createSourceFetchLog({ source_site_id: site.id, status: "skipped", error_message: summary.error });
    return summary;
  }

  const r = await safeFetch(site.url, { timeoutMs: 12000 });
  if (!r.ok || !r.text) {
    summary.ok = false;
    summary.error = r.error ?? `HTTP ${r.status}`;
    await createSourceFetchLog({
      source_site_id: site.id,
      status: "error",
      http_status: r.status || null,
      error_message: `取得失敗（${summary.error}）。手動確認に切替を推奨。`,
    });
    await supabase.from("source_sites").update({ last_checked_at: new Date().toISOString() }).eq("id", site.id);
    return summary;
  }

  const links = extractLinks(r.text, site.url);
  const audienceScope = site.audience_scope ?? "both";
  for (const lk of links) {
    summary.scanned++;
    try {
      const { inserted } = await upsertDiscoveredByExternal({
        external_id: `crawl:${lk.href}`,
        external_source: "crawl",
        source_site_id: site.id,
        title: lk.text.slice(0, 200),
        url: lk.href,
        raw_text: null,
        raw_html: null,
        pdf_url: lk.href.toLowerCase().endsWith(".pdf") ? lk.href : null,
        detection_type: "new",
        status: "unreviewed",
        source_category: site.source_type,
        trust_level: site.trust_level,
        original_source_url: lk.href,
        official_url: site.source_type === "official" ? lk.href : null,
        official_pdf_url: null,
        official_source_confirmed: site.source_type === "official",
        source_warning: null,
        last_verified_at: null,
        verification_status: site.source_type === "official" ? "official_found" : "unverified",
        duplicate_of: null,
        audience_type: audienceScope === "both" ? inferAudience(lk.text) : (audienceScope as AudienceType),
      });
      if (inserted) summary.inserted++;
      else summary.updated++;
    } catch {
      /* skip one */
    }
  }

  await createSourceFetchLog({
    source_site_id: site.id,
    status: "success",
    http_status: r.status,
    detected_count: summary.inserted + summary.updated,
  });
  await supabase.from("source_sites").update({ last_checked_at: new Date().toISOString() }).eq("id", site.id);
  return summary;
}

// ---------------- RSS/Atom フィード取り込み ----------------
function parseFeed(xml: string): { title: string; link: string; desc: string }[] {
  const items: { title: string; link: string; desc: string }[] = [];
  const pick = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (!m) return "";
    return htmlToText(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
  };
  // RSS <item>
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const b = m[0];
    items.push({ title: pick(b, "title"), link: pick(b, "link"), desc: pick(b, "description") });
  }
  // Atom <entry>
  if (items.length === 0) {
    const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
    while ((m = entryRe.exec(xml)) !== null) {
      const b = m[0];
      let link = "";
      const lm = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (lm) link = lm[1];
      items.push({ title: pick(b, "title"), link, desc: pick(b, "summary") || pick(b, "content") });
    }
  }
  return items.filter((i) => i.title && i.link).slice(0, 40);
}

/**
 * 公開RSS/Atomフィードを購読し discovered_items に保存。失敗時は error ログ。
 */
export async function runFeed(site: SourceSite): Promise<CollectSummary> {
  const summary: CollectSummary = { source: `feed:${site.name}`, ok: true, inserted: 0, updated: 0, scanned: 0 };
  const feedUrl = site.feed_url;
  if (!feedUrl) {
    summary.ok = false;
    summary.error = "feed_url未設定";
    return summary;
  }
  const r = await safeFetch(feedUrl, { timeoutMs: 12000 });
  if (!r.ok || !r.text) {
    summary.ok = false;
    summary.error = r.error ?? `HTTP ${r.status}`;
    await createSourceFetchLog({
      source_site_id: site.id,
      status: "error",
      http_status: r.status || null,
      error_message: `フィード取得失敗（${summary.error}）`,
    });
    return summary;
  }

  const entries = parseFeed(r.text);
  const audienceScope = site.audience_scope ?? "both";
  for (const e of entries) {
    summary.scanned++;
    const text = `${e.title}\n${e.desc}`;
    try {
      const { inserted } = await upsertDiscoveredByExternal({
        external_id: `feed:${e.link}`,
        external_source: "feed",
        source_site_id: site.id,
        title: e.title.slice(0, 200),
        url: e.link,
        raw_text: e.desc || null,
        raw_html: null,
        pdf_url: null,
        detection_type: "new",
        status: "unreviewed",
        source_category: site.source_type,
        trust_level: site.trust_level,
        original_source_url: e.link,
        official_url: site.source_type === "official" ? e.link : null,
        official_pdf_url: null,
        official_source_confirmed: site.source_type === "official",
        source_warning: null,
        last_verified_at: null,
        verification_status: site.source_type === "official" ? "official_found" : "unverified",
        duplicate_of: null,
        audience_type: audienceScope === "both" ? inferAudience(text) : (audienceScope as AudienceType),
      });
      if (inserted) summary.inserted++;
      else summary.updated++;
    } catch {
      /* skip one */
    }
  }

  await createSourceFetchLog({
    source_site_id: site.id,
    status: "success",
    http_status: r.status,
    detected_count: summary.inserted + summary.updated,
  });
  await supabase.from("source_sites").update({ last_checked_at: new Date().toISOString() }).eq("id", site.id);
  return summary;
}

/**
 * 全収集をまとめて実行（Jグランツ + アクティブな公式巡回 + アクティブなフィード）。
 * /api/discovery/run と手動「今すぐ全収集」ボタンの両方から呼ぶ。
 */
export async function runAll(): Promise<{ summaries: CollectSummary[]; totals: { inserted: number; updated: number } }> {
  const summaries: CollectSummary[] = [];

  // 1) Jグランツ
  summaries.push(await runJgrantsSync());

  // 2) 公式ページ巡回 + 3) フィード（情報源テーブルから）
  let sites: SourceSite[] = [];
  try {
    sites = await fetchSourceSites();
  } catch {
    sites = [];
  }
  for (const s of sites) {
    if (!s.is_active) continue;
    if (s.feed_url) summaries.push(await runFeed(s));
    // Jグランツのポータルは巡回対象から除外（APIで取得済み）
    else if (s.url && !s.url.includes("jgrants-portal.go.jp")) summaries.push(await runCrawl(s));
  }

  const totals = summaries.reduce(
    (acc, s) => ({ inserted: acc.inserted + s.inserted, updated: acc.updated + s.updated }),
    { inserted: 0, updated: 0 }
  );
  return { summaries, totals };
}
