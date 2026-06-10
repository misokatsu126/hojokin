// サンプル（デモ）データ判定。本番では通常画面から除外し、実データと混ざらないようにする。
//   判定：title/name に「サンプル」/ source が「サンプル」/ url・official_url が example.com /
//         organization に「サンプル」/ external_source が "sample"

function hasSampleWord(...parts: (string | null | undefined)[]): boolean {
  return parts.some((p) => typeof p === "string" && p.includes("サンプル"));
}
function hasExample(...urls: (string | null | undefined)[]): boolean {
  return urls.some((u) => typeof u === "string" && u.includes("example.com"));
}

export function isSampleGrant(g: {
  name?: string | null;
  organization?: string | null;
  source?: string | null;
  official_url?: string | null;
  guideline_pdf_url?: string | null;
}): boolean {
  return (
    g.source === "サンプル" ||
    hasSampleWord(g.name, g.organization, g.source) ||
    hasExample(g.official_url, g.guideline_pdf_url)
  );
}

export function isSampleDiscovered(d: {
  title?: string | null;
  url?: string | null;
  official_url?: string | null;
  external_source?: string | null;
  raw_text?: string | null;
}): boolean {
  return (
    d.external_source === "sample" ||
    hasSampleWord(d.title) ||
    hasExample(d.url, d.official_url)
  );
}

export function isSampleSource(s: { name?: string | null; url?: string | null }): boolean {
  return hasSampleWord(s.name) || hasExample(s.url);
}

export function isSampleProfile(p: { name?: string | null; notes?: string | null }): boolean {
  return hasSampleWord(p.name, p.notes);
}

// サンプル登録ボタン等を表示してよいか（本番では既定で隠す）。
//   NEXT_PUBLIC_SHOW_SAMPLE_BUTTONS=false で常に非表示、=true で常に表示。
//   未指定なら本番(NODE_ENV=production)で非表示・それ以外は表示。
export function sampleButtonsVisible(): boolean {
  const flag = process.env.NEXT_PUBLIC_SHOW_SAMPLE_BUTTONS;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return process.env.NODE_ENV !== "production";
}
