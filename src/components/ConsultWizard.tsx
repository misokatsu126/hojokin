"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NlSearchBox } from "./NlSearchBox";
import { emptyProject, upsertProject, type OrderStatus } from "@/lib/projects";

const USE_OPTIONS = [
  "空調を入れ替えたい", "店舗を改装したい", "看板を作りたい", "ホームページを作りたい",
  "ECを強化したい", "AI・在庫管理・POSを入れたい", "広告を出したい", "イベントを開催したい",
  "人を採用したい", "研修したい", "新店舗を出したい", "省エネ設備を入れたい", "セキュリティを強化したい",
];

const ORDER_OPTIONS = [
  { key: "none", label: "まだ何もしていない" },
  { key: "estimate", label: "見積だけ取った" },
  { key: "contract", label: "契約した" },
  { key: "ordered", label: "発注した" },
  { key: "paid", label: "支払い済み" },
];

// 発注状況に応じた発注前チェックのメッセージ
function orderNote(key: string): { tone: string; text: string } | null {
  switch (key) {
    case "none":
      return { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "まだ発注していないので、補助金を使えるかもしれません。契約・注文する前に、公式サイトで条件を確認しましょう。" };
    case "estimate":
      return { tone: "border-sky-200 bg-sky-50 text-sky-800", text: "見積もりだけなら、まだ間に合うかもしれません。契約・注文・支払いの前に、公式サイトで条件を確認しましょう。" };
    case "contract":
    case "ordered":
    case "paid":
      return { tone: "border-red-200 bg-red-50 text-red-700", text: "すでに契約・注文・支払い済みの費用は、対象外になることがあります。ただし、別の費用や次回の募集なら使えることもあります。" };
    default:
      return null;
  }
}

export function ConsultWizard() {
  const router = useRouter();
  const [uses, setUses] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [order, setOrder] = useState("");
  const [budget, setBudget] = useState("");
  const [when, setWhen] = useState("");
  const [entity, setEntity] = useState("");
  const [employees, setEmployees] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  function toggleUse(u: string) {
    setUses((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]));
  }

  function build() {
    const parts: string[] = [];
    if (region.trim()) parts.push(region.trim());
    if (entity) parts.push(entity);
    if (employees.trim()) parts.push(`従業員${employees.trim()}人`);
    if (uses.length) parts.push(uses.join(" "));
    if (budget.trim()) parts.push(`予算${budget.trim()}万円`);
    if (when.trim()) parts.push(`${when.trim()}までに実施`);
    const q = parts.join(" ").trim() || (uses[0] ?? "");
    setSubmitted(q);
  }

  // 相談内容から「支出案件」を作成して詳細ページへ
  function createProject() {
    const base = emptyProject();
    const useShort = uses[0]?.replace(/(を.*|したい|を導入.*)$/u, "").trim();
    const name = [region.trim(), useShort || uses[0] || "支出案件"].filter(Boolean).join(" ");
    const saved = upsertProject({
      ...base,
      name,
      uses,
      purpose: uses.join("、"),
      location: region.trim(),
      entity,
      employees: employees.trim() ? Number(employees) : null,
      budget: budget.trim() ? Number(budget) * 10000 : null,
      schedule: when.trim(),
      orderStatus: (order as OrderStatus) || "none",
    });
    router.push(`/projects/${saved.id}`);
  }

  const note = order ? orderNote(order) : null;

  return (
    <div>
      <div className="space-y-5 rounded-lg border bg-white p-5">
        {/* 1. 何に使いたいか */}
        <Field n="1" label="何にお金を使いたいですか？（複数選べます）">
          <div className="flex flex-wrap gap-1.5">
            {USE_OPTIONS.map((u) => (
              <button key={u} type="button" onClick={() => toggleUse(u)}
                className={`rounded-full border px-3 py-1.5 text-xs ${uses.includes(u) ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                {u}
              </button>
            ))}
          </div>
        </Field>

        {/* 2. どこで */}
        <Field n="2" label="どこで使いますか？（都道府県・市区町村）">
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="例：岐阜市 / 愛知県 / 弥富市"
            className="w-full rounded-md border px-3 py-2 text-sm sm:max-w-xs" />
        </Field>

        {/* 3. 発注状況 */}
        <Field n="3" label="もう発注しましたか？（補助金は発注前が原則です）">
          <div className="flex flex-wrap gap-1.5">
            {ORDER_OPTIONS.map((o) => (
              <button key={o.key} type="button" onClick={() => setOrder(o.key)}
                className={`rounded-full border px-3 py-1.5 text-xs ${order === o.key ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                {o.label}
              </button>
            ))}
          </div>
          {note && <p className={`mt-2 rounded-md border p-2 text-xs ${note.tone}`}>{note.text}</p>}
        </Field>

        {/* 4-7 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field n="4" label="予算はいくらですか？（任意）">
            <div className="flex items-center gap-1">
              <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="100"
                className="w-28 rounded-md border px-3 py-2 text-sm" />
              <span className="text-sm text-gray-500">万円</span>
            </div>
          </Field>
          <Field n="5" label="いつまでに実施したいですか？（任意）">
            <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="例：今年中 / 3月まで"
              className="w-full rounded-md border px-3 py-2 text-sm" />
          </Field>
          <Field n="6" label="法人ですか？個人ですか？">
            <div className="flex gap-1.5">
              {["法人", "個人事業主"].map((x) => (
                <button key={x} type="button" onClick={() => setEntity(entity === x ? "" : x)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${entity === x ? "border-accent bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                  {x}
                </button>
              ))}
            </div>
          </Field>
          <Field n="7" label="従業員数は何人ですか？（任意）">
            <div className="flex items-center gap-1">
              <input value={employees} onChange={(e) => setEmployees(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="5"
                className="w-24 rounded-md border px-3 py-2 text-sm" />
              <span className="text-sm text-gray-500">人</span>
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={createProject} disabled={uses.length === 0 && !region.trim()}
            className="rounded-md bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            この内容で支出案件を作る
          </button>
          <button onClick={build} disabled={uses.length === 0 && !region.trim()}
            className="rounded-md border px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            まず補助金を探すだけ
          </button>
        </div>
        {uses.length === 0 && !region.trim() && (
          <p className="text-xs text-gray-400">「何に使いたいか」か「地域」のどちらかを選ぶと、案件作成・検索ができます。</p>
        )}
        <p className="text-xs text-gray-400">「支出案件を作る」と、その支出に使える補助金を案件ごとに判定して保存できます。</p>
      </div>

      {/* 結果（NlSearchBox を初期クエリ＋自動実行で表示） */}
      {submitted && (
        <div className="mt-6 rounded-lg border bg-white p-5">
          <p className="mb-3 text-sm text-gray-600">この内容で探しています：<span className="font-medium text-ink">{submitted}</span></p>
          <NlSearchBox key={submitted} initialQuery={submitted} autoRun compact />
        </div>
      )}
    </div>
  );
}

function Field({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{n}</span>
        <span className="text-sm font-semibold text-ink">{label}</span>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}
