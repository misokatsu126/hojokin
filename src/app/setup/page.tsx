"use client";

import { useState } from "react";
import Link from "next/link";
import { createProfile } from "@/lib/supabase";
import type { BusinessProfileInput } from "@/lib/types";
import { INDUSTRIES, ENTITY_TYPES } from "@/lib/constants";
import { CheckboxGroup, TextField, SelectField, TextArea } from "@/components/Form";

// やりたいこと（よくある目的）。値は PURPOSES の表記に合わせる（照合に使われる）。
const WANT_OPTIONS = [
  "設備導入",
  "店舗改装",
  "EC強化",
  "DX",
  "スタッフ採用",
  "社員教育",
  "省エネ",
  "販路開拓",
  "広告宣伝",
  "商品開発",
  "創業",
  "業務自動化",
] as const;

// 地域（対象5地域＋全国。必要なら後で事業プロフィール画面で追加可）
const REGION_OPTIONS = ["全国", "愛知県", "名古屋市", "弥富市", "岐阜県", "岐阜市", "三重県", "四日市市"] as const;

export default function SetupPage() {
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [location, setLocation] = useState("");
  const [employees, setEmployees] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [wants, setWants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      alert("会社名・事業名を入力してください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input: BusinessProfileInput = {
        name: name.trim(),
        entity_type: entityType || null,
        location: location || null,
        regions,
        industries,
        description: description || null,
        purposes: wants,
        expenses: [],
        keywords: [],
        exclude_keywords: [],
        desired_amount: null,
        notes: employees ? `従業員数: ${employees}` : null,
      };
      await createProfile(input);
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <div className="mb-3 text-3xl">🎉</div>
        <h1 className="mb-2 text-xl font-bold text-ink">事業プロフィールを登録しました</h1>
        <p className="mb-6 text-sm text-gray-600">
          これで、毎日自動で集まる補助金の中から「あなたの事業に合いそうなもの」を相性スコア付きで表示できます。
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/" className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90">トップで今日の候補を見る</Link>
          <button onClick={() => { setDone(false); setName(""); setRegions([]); setIndustries([]); setWants([]); setDescription(""); setEmployees(""); }} className="rounded-md border px-5 py-2 text-sm text-gray-600 hover:bg-gray-50">続けてもう1社登録</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold text-ink">かんたん初期設定</h1>
      <p className="mb-5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
        まずは自社の事業を1つ登録しましょう。ここで入力した内容をもとに、毎日集まる補助金から「相性の良いもの」を自動でおすすめします（あとから変更できます）。
      </p>

      {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="space-y-5 rounded-lg border bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="会社名・事業名" value={name} onChange={setName} required />
          <SelectField label="法人の種類" value={entityType} onChange={setEntityType} options={ENTITY_TYPES} />
          <TextField label="所在地" value={location} onChange={setLocation} placeholder="例：名古屋市中区" />
          <TextField label="従業員数" value={employees} onChange={setEmployees} placeholder="例：10名" />
        </div>

        <Field label="対象地域（補助金を探したい地域）">
          <CheckboxGroup options={REGION_OPTIONS} selected={regions} onChange={setRegions} />
        </Field>
        <Field label="業種">
          <CheckboxGroup options={INDUSTRIES} selected={industries} onChange={setIndustries} />
        </Field>
        <Field label="やりたいこと（補助金で実現したいこと）">
          <CheckboxGroup options={WANT_OPTIONS} selected={wants} onChange={setWants} />
        </Field>
        <TextArea label="事業内容（自由記入）" value={description} onChange={setDescription} rows={3} placeholder="例：トレーディングカードの店舗販売・EC・大会イベント運営" />

        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy} className="rounded-md bg-accent px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "登録中…" : "この内容で登録する"}
          </button>
          <Link href="/profiles" className="text-sm text-gray-500 hover:underline">詳しく設定する（事業プロフィール）</Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </div>
  );
}
