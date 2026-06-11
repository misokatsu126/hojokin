import { NextRequest, NextResponse } from "next/server";
import { fetchCollectSettings, saveCollectSettings } from "@/lib/supabase";
import { expandQuery, expandRegions } from "@/lib/synonyms";

export const runtime = "nodejs";

// 「補助金」「の」などは収集キーワードとして無意味なので除外
const STOP = new Set([
  "補助金", "助成金", "給付金", "支援金", "制度", "の", "を", "に", "は", "が", "で", "や", "と",
  "探したい", "探して", "教えて", "使える", "使いたい", "ほしい", "欲しい", "ください", "あります", "ありますか",
  "みたいな", "とか", "など", "屋", "店",
]);

/**
 * 相談ワード（自然文）を「毎日の自動収集」の対象として保存する。
 * 入力を業種・キーワード・地域に展開し、既存の収集設定（collect_settings）に追記する。
 * 収集の既定キーワードは collect.ts 側で常に併用されるため、登録しても収集は狭まらない。
 */
export async function POST(req: NextRequest) {
  let query = "";
  try {
    const b = await req.json();
    query = String(b.query ?? "").trim();
  } catch {
    /* noop */
  }
  if (!query) return NextResponse.json({ error: "ワードが空です" }, { status: 400 });

  const ex = expandQuery(query);
  const regions = expandRegions(query);
  const tokens = query
    .replace(/https?:\/\/[^\s　]+/g, " ")
    .split(/[\s　、，,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !STOP.has(s));
  const keywords = Array.from(new Set([...ex.industries, ...ex.keywords, ...tokens]))
    .filter((k) => k.length >= 2 && k.length <= 255)
    .slice(0, 30);

  if (keywords.length === 0 && regions.length === 0) {
    return NextResponse.json({ error: "このワードからは収集条件を取り出せませんでした。地域名やお店の種類を入れてみてください。" }, { status: 400 });
  }

  try {
    const cur = await fetchCollectSettings();
    const mergedKw = Array.from(new Set([...(cur?.keywords ?? []), ...keywords]));
    const mergedRg = Array.from(new Set([...(cur?.regions ?? []), ...regions]));
    await saveCollectSettings(mergedKw, mergedRg);
    return NextResponse.json({ ok: true, keywords, regions });
  } catch (e) {
    return NextResponse.json(
      { error: `保存に失敗しました（${(e as Error).message}）。discovery_collect_settings_schema.sql が未実行の可能性があります。` },
      { status: 500 }
    );
  }
}
