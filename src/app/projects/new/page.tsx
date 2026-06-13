"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  emptyProject, upsertProject, getTemplate, PROJECT_TEMPLATE_GROUPS, PURPOSE_TAGS,
  templateExamples, INDUSTRY_PRESETS,
  ORDER_STATUS_LABEL, URGENCY_LABEL, formatBudget,
  type SpendingProject, type OrderStatus, type Urgency, type ProjectTemplate,
} from "@/lib/projects";

const STEPS = ["支出テーマ", "どこで？", "予算・時期", "発注状況", "会社情報", "確認"];

function NewProjectWizard() {
  const router = useRouter();
  const sp = useSearchParams();
  const [step, setStep] = useState(0);
  const [custom, setCustom] = useState(false);
  const [mode, setMode] = useState<"theme" | "industry">("theme");
  const [industry, setIndustry] = useState<string | null>(null);
  const [p, setP] = useState<SpendingProject>(() => {
    // ホームの空状態テンプレート（?template=aircon 等）から開いたら、そのテンプレを選択済みにする
    const base = emptyProject();
    const t = getTemplate(sp.get("template"));
    return t ? { ...base, templateKey: t.key, name: t.name, uses: [...t.uses], purpose: t.label } : base;
  });
  const set = (k: keyof SpendingProject, v: any) => setP((prev) => ({ ...prev, [k]: v }));
  const tpl = getTemplate(p.templateKey);

  function pickTemplate(t: ProjectTemplate) {
    setCustom(false);
    setP((prev) => ({ ...prev, templateKey: t.key, name: t.name, uses: [...t.uses], purpose: t.label, answers: {} }));
  }
  function setAnswer(qid: string, val: string) {
    setP((prev) => ({ ...prev, answers: { ...(prev.answers ?? {}), [qid]: prev.answers?.[qid] === val ? "" : val } }));
  }
  function toggleUse(u: string) {
    setP((prev) => ({ ...prev, uses: prev.uses.includes(u) ? prev.uses.filter((x) => x !== u) : [...prev.uses, u] }));
  }
  function save() {
    const name = p.name.trim() || p.uses[0] || "新しい補助金チェック";
    const saved = upsertProject({ ...p, name });
    router.push(`/projects/${saved.id}?created=1`);
  }

  const canNext = !!p.templateKey || p.uses.length > 0 || p.name.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 text-xs text-gray-400"><Link href="/projects" className="hover:underline">補助金チェック</Link> ／ 新規作成</div>
      <h1 className="mb-1 text-xl font-bold text-ink">補助金チェックを作る</h1>

      {/* 進捗 */}
      <div className="mb-4 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-1">
            <span className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-gray-200"}`} />
          </div>
        ))}
      </div>
      <p className="mb-3 text-xs text-gray-500">ステップ {step + 1} / {STEPS.length}：{STEPS[step]}</p>

      <div className="rounded-lg border bg-white p-5">
        {/* ステップ1：テンプレート */}
        {step === 0 && (
          <div>
            <h2 className="mb-1 text-base font-semibold text-ink">何にお金を使う予定ですか？</h2>
            <p className="mb-3 text-xs text-gray-500">ここで選ぶのは「今日やる作業」ではなく、補助金を確認したい支出内容です。近いものを選んでください（あとから変えられます）。</p>

            {/* 選び方の切替：テーマから / 業種から */}
            <div className="mb-3 inline-flex rounded-md border p-0.5 text-xs">
              <button onClick={() => setMode("theme")} className={`rounded px-3 py-1 ${mode === "theme" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>テーマから選ぶ</button>
              <button onClick={() => setMode("industry")} className={`rounded px-3 py-1 ${mode === "industry" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>業種から選ぶ</button>
            </div>

            {mode === "industry" && (
              <div className="mb-3">
                <p className="mb-1 text-xs text-gray-500">業種を選ぶと、その業種でよくある支出を表示します。</p>
                <div className="flex flex-wrap gap-1.5">
                  {INDUSTRY_PRESETS.map((ind) => (
                    <button key={ind.label} onClick={() => { setIndustry(ind.label); setP((prev) => ({ ...prev, industry: prev.industry || ind.label })); }}
                      className={`rounded-full border px-3 py-1.5 text-xs ${industry === ind.label ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{ind.label}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {(mode === "theme"
                ? PROJECT_TEMPLATE_GROUPS
                : industry
                ? [{ title: `${industry}でよくある支出`, keys: INDUSTRY_PRESETS.find((i) => i.label === industry)!.keys }]
                : []
              ).map((g) => (
                <div key={g.title}>
                  <p className="mb-1 text-xs font-semibold text-gray-600">{g.title}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {g.keys.map((k) => getTemplate(k)).filter(Boolean).map((t) => (
                      <button key={t!.key} onClick={() => pickTemplate(t!)}
                        className={`rounded-lg border p-3 text-left text-sm transition hover:border-accent hover:shadow-sm ${p.templateKey === t!.key ? "border-accent bg-accent/5" : ""}`}>
                        <div className="font-medium text-ink">{t!.label}</div>
                        {templateExamples(t!.key).length > 0 && (
                          <div className="mt-0.5 text-[10px] leading-snug text-gray-400">例：{templateExamples(t!.key).join("／")}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {mode === "industry" && !industry && (
                <p className="rounded-md border border-dashed bg-slate-50 p-3 text-xs text-gray-500">上から業種を選んでください。</p>
              )}
            </div>
            {/* 選んだテンプレートの説明＋固有の質問 */}
            {tpl && !custom && (
              <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
                <p className="text-sm font-semibold text-ink">{tpl.label}</p>
                <p className="mt-0.5 text-xs text-gray-600">{tpl.description}</p>
                {templateExamples(tpl.key).length > 0 && (
                  <p className="mt-1 text-[11px] text-gray-500">こんな支出に：{templateExamples(tpl.key).join("／")}</p>
                )}
                <p className="mt-1 text-[11px] text-sky-800">関係しそうな補助金：{tpl.genres.join("、")}</p>
                {tpl.questions.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {tpl.questions.map((qq) => (
                      <div key={qq.id}>
                        <div className="text-xs font-medium text-ink">{qq.q}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {qq.options.map((o) => (
                            <button key={o} onClick={() => setAnswer(qq.id, o)}
                              className={`rounded-full border px-2.5 py-1 text-[11px] ${p.answers?.[qq.id] === o ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-white"}`}>{o}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 rounded-md bg-white/70 px-2 py-1 text-[11px] text-amber-800">⚠ {tpl.caution}</p>
              </div>
            )}

            <button onClick={() => { setCustom(true); setP((prev) => ({ ...prev, templateKey: "" })); }}
              className={`mt-3 rounded-md border px-3 py-2 text-xs ${custom ? "border-accent bg-accent/5 text-accent" : "text-gray-600 hover:bg-gray-50"}`}>
              ＋ 一覧にない・決まっていない（自由に書く）
            </button>
            {custom && (
              <div className="mt-3 space-y-2 rounded-md border bg-slate-50 p-3">
                <input value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="案件名（例：新サービスのチラシ制作）" className="w-full rounded-md border px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-1.5">
                  {PURPOSE_TAGS.map((u) => (
                    <button key={u} onClick={() => toggleUse(u)} className={`rounded-full border px-2.5 py-1 text-[11px] ${p.uses.includes(u) ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-white"}`}>{u}</button>
                  ))}
                </div>
              </div>
            )}

            {/* 30秒かんたん作成：テーマ＋発注状況だけで作る */}
            {canNext && (
              <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3">
                <p className="text-xs font-semibold text-ink">もう発注しましたか？（任意・あとで変更できます）</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((o) => (
                    <button key={o} onClick={() => set("orderStatus", o)} className={`rounded-full border px-2.5 py-1 text-[11px] ${p.orderStatus === o ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-white"}`}>{ORDER_STATUS_LABEL[o]}</button>
                  ))}
                </div>
                <button onClick={save} className="mt-2.5 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">これで作成する（30秒・あとで詳しく）</button>
                <p className="mt-1 text-center text-[11px] text-gray-500">場所・予算・会社情報は、作成後の画面で足せます。</p>
              </div>
            )}
          </div>
        )}

        {/* ステップ2：どこで */}
        {step === 1 && (
          <div className="space-y-4">
            <Field label="対象の店舗・事業（任意）"><input value={p.store} onChange={(e) => set("store", e.target.value)} placeholder="例：本店 / ◯◯店" className="w-full rounded-md border px-3 py-2 text-sm" /></Field>
            <Field label="どこで使いますか？（所在地）" hint="市区町村・都道府県でOK"><input value={p.location} onChange={(e) => set("location", e.target.value)} placeholder="例：市区町村・都道府県" className="w-full rounded-md border px-3 py-2 text-sm" /></Field>
          </div>
        )}

        {/* ステップ3：予算と時期 */}
        {step === 2 && (
          <div className="space-y-4">
            <Field label="予算はどのくらい？（任意）">
              <div className="flex items-center gap-1"><input value={p.budget != null ? Math.round(p.budget / 10000) : ""} onChange={(e) => set("budget", e.target.value ? Number(e.target.value.replace(/[^0-9]/g, "")) * 10000 : null)} inputMode="numeric" placeholder="100" className="w-28 rounded-md border px-3 py-2 text-sm" /><span className="text-sm text-gray-500">万円</span></div>
            </Field>
            <Field label="いつ頃やりたいですか？（任意）"><input value={p.schedule} onChange={(e) => set("schedule", e.target.value)} placeholder="例：今年中 / 来春" className="w-full rounded-md border px-3 py-2 text-sm" /></Field>
            <Field label="急ぎ度">
              <div className="flex gap-1.5">{(["low", "mid", "high"] as Urgency[]).map((u) => (
                <button key={u} onClick={() => set("urgency", u)} className={`rounded-full border px-3 py-1.5 text-xs ${p.urgency === u ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{URGENCY_LABEL[u]}</button>
              ))}</div>
            </Field>
          </div>
        )}

        {/* ステップ4：発注状況 */}
        {step === 3 && (
          <div>
            <Field label="この支出、もう発注しましたか？" hint="補助金は「発注前」が原則です。ここは特に大事です。">
              <div className="flex flex-col gap-1.5">{(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((o) => (
                <button key={o} onClick={() => set("orderStatus", o)} className={`rounded-md border px-3 py-2 text-left text-sm ${p.orderStatus === o ? "border-accent bg-accent/5 text-accent" : "text-gray-700 hover:bg-gray-50"}`}>{ORDER_STATUS_LABEL[o]}</button>
              ))}</div>
            </Field>
            {(p.orderStatus === "contract" || p.orderStatus === "ordered" || p.orderStatus === "paid") && (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">すでに発注済みの経費は対象外の可能性があります。ただし別経費・次回公募で使える可能性もあるので登録しておきましょう。</p>
            )}
          </div>
        )}

        {/* ステップ5：会社情報 */}
        {step === 4 && (
          <div className="space-y-4">
            <Field label="法人ですか？個人ですか？">
              <div className="flex gap-1.5">{["法人", "個人事業主"].map((x) => (
                <button key={x} onClick={() => set("entity", p.entity === x ? "" : x)} className={`rounded-full border px-3 py-1.5 text-xs ${p.entity === x ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{x}</button>
              ))}</div>
            </Field>
            <Field label="業種（任意）"><input value={p.industry} onChange={(e) => set("industry", e.target.value)} placeholder="例：小売 / 飲食 / 製造業" className="w-full rounded-md border px-3 py-2 text-sm" /></Field>
            <Field label="従業員数（任意）" hint="小規模事業者向け補助金の判定に使います"><div className="flex items-center gap-1"><input value={p.employees ?? ""} onChange={(e) => set("employees", e.target.value ? Number(e.target.value.replace(/[^0-9]/g, "")) : null)} inputMode="numeric" className="w-24 rounded-md border px-3 py-2 text-sm" /><span className="text-sm text-gray-500">人</span></div></Field>
          </div>
        )}

        {/* ステップ6：確認 */}
        {step === 5 && (
          <div className="space-y-3 text-sm">
            <h2 className="text-base font-semibold text-ink">この内容で作成します</h2>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5">
              <Row k="案件名" v={p.name || p.uses[0] || "（未設定）"} />
              <Row k="使いたいこと" v={p.uses.join("、") || p.purpose || "—"} />
              <Row k="場所" v={[p.store, p.location].filter(Boolean).join("／") || "—"} />
              <Row k="予算・時期" v={[p.budget != null ? formatBudget(p.budget) : "", p.schedule].filter(Boolean).join("・") || "—"} />
              <Row k="発注状況" v={ORDER_STATUS_LABEL[p.orderStatus]} />
              <Row k="会社" v={[p.entity, p.industry, p.employees != null ? `${p.employees}人` : ""].filter(Boolean).join("・") || "—"} />
            </dl>
            {tpl && (
              <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                <p className="font-semibold">確認すべき補助金ジャンル：{tpl.genres.join("、")}</p>
                <p className="mt-1">注意点：{tpl.caution}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ナビゲーション */}
      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => (step === 0 ? router.push("/projects") : setStep((s) => s - 1))} className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">{step === 0 ? "やめる" : "← 戻る"}</button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !canNext}
            className="rounded-md bg-accent px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">次へ →</button>
        ) : (
          <button onClick={save} className="rounded-md bg-accent px-6 py-2 text-sm font-semibold text-white hover:opacity-90">作成して補助金を判定する</button>
        )}
      </div>
      {step === 0 && !canNext && <p className="mt-2 text-center text-xs text-gray-400">上から1つ選ぶと次に進めます。</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {hint && <span className="mb-1.5 block text-xs text-gray-400">{hint}</span>}
      {children}
    </label>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (<><dt className="text-gray-400">{k}</dt><dd className="col-span-2 text-ink">{v}</dd></>);
}

export default function NewProjectPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-gray-400">読み込み中…</p>}>
      <NewProjectWizard />
    </Suspense>
  );
}
