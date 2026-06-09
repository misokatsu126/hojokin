"use client";

import { NlSearchBox } from "@/components/NlSearchBox";

export default function SearchPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">自然文AI検索</h1>
      <p className="mb-5 text-sm text-gray-500">
        「何に使いたいか」を自然な文章で入力すると、登録済みの補助金・助成金から候補を一次判定します。
      </p>

      <div className="rounded-lg border bg-white p-5">
        <NlSearchBox />
      </div>

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
