// scripts/update-external-sources.mjs
// J-Net21 RSS と ミラサポplus 補助金一覧を「実HTTP取得」し、抽出して Supabase の
// discovered_items / source_fetch_logs に保存する検証・運用コマンド。
// 使い方: npm run update:external-sources
//   .env.local の NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を読みます。
// ※ モックは返しません。取得失敗時は理由を表示し、source_fetch_logs に error を記録します。

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const candidates = [
    `${process.cwd()}/.env.local`,
    new URL("../.env.local", import.meta.url),
  ];
  for (const p of candidates) {
    try {
      const txt = readFileSync(p, "utf8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
      return;
    } catch {
      /* 次の候補へ */
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です（.env.local を確認）。");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const UA = "HojokinRadar/1.0 (+external updater; contact: tool admin)";
const TARGET_PREFS = ["愛知県", "岐阜県", "三重県"];
const PREFECTURES = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
function keepForRegion(text) {
  if (!text) return true;
  if (text.includes("全国") || TARGET_PREFS.some((p) => text.includes(p)) || text.includes("名古屋") || text.includes("弥富") || text.includes("四日市")) return true;
  const other = PREFECTURES.some((p) => !TARGET_PREFS.includes(p) && text.includes(p));
  return !other;
}
function stripTags(s) { return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim(); }
function buildKey(name) {
  return (name || "").normalize("NFKC").toLowerCase().replace(/[\s　]/g, "").replace(/[、。・,.\-―ー_()（）「」【】\[\]"'’“”:：;；/／|｜~〜!！?？#＃&＆*＊]/g, "");
}

async function httpGet(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,application/xml;q=0.9,*/*;q=0.8" } });
    clearTimeout(t);
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, status: 0, error: e?.name === "AbortError" ? "timeout(15s)" : String(e?.message || e) };
  }
}

function get(b, tag) {
  const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? stripTags(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
}
function parseRss(xml) {
  const items = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[0];
    items.push({ title: get(b, "title"), link: get(b, "link"), pubDate: get(b, "pubDate") || get(b, "dc:date"), description: get(b, "description") });
  }
  return items;
}
function extractLinks(html, base) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[2]);
    if (text.length < 4 || !/(補助金|助成金|給付金|支援金|補助|助成)/.test(text)) continue;
    let abs;
    try { abs = new global.URL(m[1], base).toString(); } catch { continue; }
    out.push({ href: abs, text });
    if (out.length >= 40) break;
  }
  return out;
}

async function findOrCreateSite(url, defaults) {
  const { data } = await supabase.from("source_sites").select("*").eq("url", url).maybeSingle();
  if (data) return data;
  const { data: ins } = await supabase.from("source_sites").insert(defaults).select().single();
  return ins;
}
async function upsertItem(row) {
  const { data: ex } = await supabase.from("discovered_items").select("id").eq("external_id", row.external_id).maybeSingle();
  if (ex) { await supabase.from("discovered_items").update(row).eq("external_id", row.external_id); return false; }
  await supabase.from("discovered_items").insert(row); return true;
}
async function log(siteId, status, httpStatus, count, err) {
  await supabase.from("source_fetch_logs").insert({ source_site_id: siteId, status, http_status: httpStatus ?? null, detected_count: count ?? 0, error_message: err ?? null });
}

const report = { accessed: [], saved: 0, extracted: 0, failures: [] };

async function doJnet21() {
  const url = "https://j-net21.smrj.go.jp/snavi/support/support.xml";
  const fetchedAt = new Date().toISOString();
  // まず実HTTP取得（DB到達性に関わらずアクセス結果を必ず記録）
  const res = await httpGet(url);
  report.accessed.push({ url, status: res.status, ok: res.ok, length: res.body?.length ?? 0, error: res.error });
  let site = null;
  try {
    site = await findOrCreateSite("https://j-net21.smrj.go.jp/", { name: "J-Net21 支援情報ヘッドライン（中小機構）", source_type: "semi_official", trust_level: "B", url: "https://j-net21.smrj.go.jp/", region: "全国", priority: "high", crawl_frequency: "daily", is_active: true, feed_url: url });
  } catch (e) { report.failures.push({ url: "supabase(source_sites)", reason: String(e?.message || e) }); }
  if (!res.ok || !res.body) { report.failures.push({ url, reason: res.error || `HTTP ${res.status}` }); try { await log(site?.id, "error", res.status, 0, res.error || `HTTP ${res.status}`); } catch {} return; }
  const items = parseRss(res.body);
  let saved = 0;
  for (const it of items) {
    if (!it.title || !it.link) continue;
    if (!keepForRegion(`${it.title} ${it.description}`)) continue;
    report.extracted++;
    const inserted = await upsertItem({
      external_id: `jnet21:${it.link}`, external_source: "jnet21", source_site_id: site?.id ?? null,
      title: it.title.slice(0, 200), url: it.link, official_url: it.link, original_source_url: it.link,
      raw_text: [it.title, it.pubDate && `公開日: ${it.pubDate}`, it.description].filter(Boolean).join("\n"),
      detection_type: "new", status: "unreviewed", source_category: "semi_official", trust_level: "B",
      verification_status: "needs_review", normalized_key: buildKey(it.title), fetched_at: fetchedAt,
      extraction_confidence: Math.min(100, 40 + (it.link ? 20 : 0) + (it.pubDate ? 20 : 0) + (it.description ? 20 : 0)),
    });
    if (inserted) saved++;
  }
  report.saved += saved;
  await log(site?.id, "success", res.status, saved);
  console.log(`J-Net21: extracted=${items.length} kept&saved=${saved}`);
}

async function doMirasapo() {
  const url = "https://mirasapo-plus.go.jp/subsidy/";
  const fetchedAt = new Date().toISOString();
  const res = await httpGet(url);
  report.accessed.push({ url, status: res.status, ok: res.ok, length: res.body?.length ?? 0, error: res.error });
  let site = null;
  try {
    site = await findOrCreateSite("https://mirasapo-plus.go.jp/", { name: "ミラサポplus（経産省・中小企業庁／出典表示）", source_type: "semi_official", trust_level: "B", url: "https://mirasapo-plus.go.jp/", region: "全国", priority: "medium", crawl_frequency: "weekly", is_active: true });
  } catch (e) { report.failures.push({ url: "supabase(source_sites)", reason: String(e?.message || e) }); }
  if (!res.ok || !res.body) { report.failures.push({ url, reason: res.error || `HTTP ${res.status}` }); try { await log(site?.id, "error", res.status, 0, res.error || `HTTP ${res.status}`); } catch {} return; }
  const links = extractLinks(res.body, url);
  if (links.length === 0) { report.failures.push({ url, reason: `一覧抽出0件（HTML ${res.body.length}字・JS描画の可能性）` }); await log(site?.id, "success", res.status, 0, "一覧抽出0件"); return; }
  let saved = 0;
  for (const lk of links) {
    if (!keepForRegion(lk.text)) continue;
    report.extracted++;
    const isPdf = lk.href.toLowerCase().endsWith(".pdf");
    const inserted = await upsertItem({
      external_id: `mirasapo:${lk.href}`, external_source: "mirasapo", source_site_id: site?.id ?? null,
      title: lk.text.slice(0, 200), url: lk.href, official_url: lk.href, original_source_url: url,
      raw_text: `出典：中小企業庁『ミラサポplus』\n${lk.text}`, pdf_url: isPdf ? lk.href : null, official_pdf_url: isPdf ? lk.href : null,
      detection_type: "new", status: "unreviewed", source_category: "semi_official", trust_level: "B",
      verification_status: "needs_review", normalized_key: buildKey(lk.text), fetched_at: fetchedAt,
      extraction_confidence: Math.min(100, 30 + 25 + (isPdf ? 20 : 0)),
    });
    if (inserted) saved++;
  }
  report.saved += saved;
  await log(site?.id, "success", res.status, saved);
  console.log(`ミラサポplus: extracted_links=${links.length} kept&saved=${saved}`);
}

console.log("=== update-external-sources: 実HTTP取得→DB保存 ===", new Date().toISOString());
await doJnet21().catch((e) => report.failures.push({ url: "jnet21", reason: String(e?.message || e) }));
await doMirasapo().catch((e) => report.failures.push({ url: "mirasapo", reason: String(e?.message || e) }));
console.log("\n--- レポート ---");
console.log("アクセスURL/ステータス:");
for (const a of report.accessed) console.log(`  ${a.status} ${a.ok ? "OK" : "NG"} len=${a.length}${a.error ? " err=" + a.error : ""}  ${a.url}`);
console.log(`抽出件数: ${report.extracted}`);
console.log(`保存(新規)件数: ${report.saved}`);
console.log(`失敗: ${report.failures.length ? JSON.stringify(report.failures) : "なし"}`);
console.log("=== 完了 ===");
