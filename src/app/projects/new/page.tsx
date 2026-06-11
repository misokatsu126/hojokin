"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { emptyProject, upsertProject, PURPOSE_TAGS, ORDER_STATUS_LABEL, URGENCY_LABEL, type SpendingProject, type OrderStatus, type Urgency } from "@/lib/projects";

function NewProjectForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [p, setP] = useState<SpendingProject>(() => {
    const base = emptyProject();
    // 相談ウィザード等からの初期値（?name=&location=&budget=&uses=a,b&order=）
    return {
      ...base,
      name: sp.get("name") ?? "",
      location: sp.get("location") ?? "",
      purpose: sp.get("purpose") ?? "",
      uses: (sp.get("uses") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      budget: sp.get("budget") ? Number(sp.get("budget")) : null,
      entity: sp.get("entity") ?? "",
      employees: sp.get("employees") ? Number(sp.get("employees")) : null,
      schedule: sp.get("schedule") ?? "",
      orderStatus: (sp.get("order") as OrderStatus) || "none",
    };
  });
  const set = (k: keyof SpendingProject, v: any) => setP((prev) => ({ ...prev, [k]: v }));
  const toggleUse = (u: string) => setP((prev) => ({ ...prev, uses: prev.uses.includes(u) ? prev.uses.filter((x) => x !== u) : [...prev.uses, u] }));

  function save() {
    const name = p.name.trim() || p.uses[0] || "新しい支出案件";
    const saved = upsertProject({ ...p, name });
    router.push(`/projects/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 text-xs text-gray-400"><Link href="/projects" className="hover:underline">支出案件</Link> ／ 新規作成</div>
      <h1 className="mb-1 text-xl font-bold text-ink">支出案件を追加</h1>
      <p className="mb-4 text-sm text-gray-500">これからお金を使う予定を登録します。分かる範囲でOKです（後から編集できます）。</p>

      <div className="space-y-5 rounded-lg border bg-white p-5">
        <Field label="案件名" hint="例：岐阜店 空調入替 / ECサイト制作">
          <input value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="案件名" className="w-full rounded-md border px-3 py-2 text-sm" />
        </Field>

        <Field label="何にお金を使いたいですか？（複数選べます）">
          <div className="flex flex-wrap gap-1.5">
            {PURPOSE_TAGS.map((u) => (
              <button key={u} type="button" onClick={() => toggleUse(u)} className={`rounded-full border px-3 py-1.5 text-xs ${p.uses.includes(u) ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{u}</button>
            ))}
          </div>
          <textarea value={p.purpose} onChange={(e) => set("purpose", e.target.value)} rows={2} placeholder="自由記述（例：店舗の業務用エアコンを高効率機に入れ替え）" className="mt-2 w-full rounded-md border px-3 py-2 text-sm" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="対象店舗・事業"><input value={p.store} onChange={(e) => set("store", e.target.value)} placeholder="例：岐阜店" className="w-full rounded-md border px-3 py-2 text-sm" /></Field>
          <Field label="所在地"><input value={p.location} onChange={(e) => set("location", e.target.value)} placeholder="例：岐阜市 / 愛知県" className="w-full rounded-md border px-3 py-2 text-sm" /></Field>
          <Field label="法人種別">
            <div className="flex gap-1.5">
              {["法人", "個人事業主"].map((x) => (
                <button key={x} type="button" onClick={() => set("entity", p.entity === x ? "" : x)} className={`rounded-full border px-3 py-1.5 text-xs ${p.entity === x ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{x}</button>
              ))}
            </div>
          </Field>
          <Field label="業種（任意）"><input value={p.industry} onChange={(e) => set("industry", e.target.value)} placeholder="例：小売 / 飲食 / 製造業" className="w-full rounded-md border px-3 py-2 text-sm" /></Field>
          <Field label="従業員数（任意）"><div className="flex items-center gap-1"><input value={p.employees ?? ""} onChange={(e) => set("employees", e.target.value ? Number(e.target.value.replace(/[^0-9]/g, "")) : null)} inputMode="numeric" className="w-24 rounded-md border px-3 py-2 text-sm" /><span className="text-sm text-gray-500">人</span></div></Field>
          <Field label="予算（任意）"><div className="flex items-center gap-1"><input value={p.budget != null ? Math.round(p.budget / 10000) : ""} onChange={(e) => set("budget", e.target.value ? Number(e.target.value.replace(/[^0-9]/g, "")) * 10000 : null)} inputMode="numeric" placeholder="100" className="w-28 rounded-md border px-3 py-2 text-sm" /><span className="text-sm text-gray-500">万円</span></div></Field>
          <Field label="実施予定時期（任意）"><input value={p.schedule} onChange={(e) => set("schedule", e.target.value)} placeholder="例：今年中 / 来春" className="w-full rounded-md border px-3 py-2 text-sm" /></Field>
          <Field label="緊急度">
            <div className="flex gap-1.5">
              {(["low", "mid", "high"] as Urgency[]).map((u) => (
                <button key={u} type="button" onClick={() => set("urgency", u)} className={`rounded-full border px-3 py-1.5 text-xs ${p.urgency === u ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{URGENCY_LABEL[u]}</button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="発注状況（補助金は発注前が原則です）">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((o) => (
              <button key={o} type="button" onClick={() => set("orderStatus", o)} className={`rounded-full border px-3 py-1.5 text-xs ${p.orderStatus === o ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{ORDER_STATUS_LABEL[o]}</button>
            ))}
          </div>
        </Field>

        <Field label="メモ（任意）"><textarea value={p.memo} onChange={(e) => set("memo", e.target.value)} rows={2} className="w-full rounded-md border px-3 py-2 text-sm" /></Field>

        <div className="flex gap-2">
          <button onClick={save} className="rounded-md bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90">保存して補助金を判定する</button>
          <Link href="/projects" className="rounded-md border px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50">キャンセル</Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {hint && <span className="mb-1 block text-xs text-gray-400">{hint}</span>}
      {children}
    </label>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-gray-400">読み込み中…</p>}>
      <NewProjectForm />
    </Suspense>
  );
}
