"use client";

import { useState } from "react";
import { NlSearchBox } from "@/components/NlSearchBox";
import { ConsultWizard } from "@/components/ConsultWizard";

export default function SearchPage() {
  const [mode, setMode] = useState<"wizard" | "free">("wizard");
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">相談して探す</h1>
      <p className="mb-4 text-sm text-gray-500">
        制度名を知らなくても大丈夫です。質問に答えるか、やりたいことをそのまま入力すると、使える可能性がある補助金・助成金を探します。
      </p>

      <div className="mb-4 flex rounded-md border p-0.5 text-sm">
        <button onClick={() => setMode("wizard")} className={`flex-1 rounded px-3 py-1.5 transition ${mode === "wizard" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>質問に答えて探す</button>
        <button onClick={() => setMode("free")} className={`flex-1 rounded px-3 py-1.5 transition ${mode === "free" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`}>文章で探す</button>
      </div>

      {mode === "wizard" ? (
        <ConsultWizard />
      ) : (
        <div className="rounded-lg border bg-white p-5">
          <NlSearchBox />
        </div>
      )}

      <div className="mt-6 rounded-lg border bg-white p-4 text-sm text-gray-600">
        <h2 className="mb-2 font-semibold text-ink">この検索について</h2>
        <p className="leading-relaxed">
          入力文から「地域・業種・法人種別・目的・対象経費・補助上限額・締切条件・募集状態・キーワード」を抽出し、
          登録済みデータと照合します。完全一致がない場合は条件を緩和して近い候補を提案します。
          OpenAI APIキーが設定されていればAIが条件を抽出し、未設定の場合はルールベースで抽出します。
          いずれの場合も、これは登録済みデータに対する一次判定であり、申請可否や受給を保証するものではありません。
        </p>
      </div>
    </div>
  );
}
