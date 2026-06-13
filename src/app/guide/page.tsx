"use client";

import Link from "next/link";

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-ink sm:text-2xl">使い方ガイド</h1>
      <p className="mt-1 mb-5 text-sm leading-relaxed text-gray-600">
        補助金の名前を知らなくても大丈夫です。まずは「これから何にお金を使う予定か」から始めましょう。
      </p>

      {/* 1. このサイトでできること */}
      <Card title="① このツールでできること">
        <p className="text-sm leading-relaxed text-gray-700">
          これは補助金の一覧サイトではありません。「空調を入れ替えたい」「広告を出したい」「AI・在庫管理を入れたい」「店舗を改装したい」などの
          <strong>これからの支出</strong>に、使える補助金がないかを判定し、やることを整理するツールです。
        </p>
        <ul className="mt-2 grid gap-1 text-sm text-gray-600 sm:grid-cols-2">
          <li>・使えるかもしれない定番の制度</li>
          <li>・契約・注文する前に確認すること</li>
          <li>・今日やる申請の準備</li>
          <li>・見落としやすい制度への注意</li>
          <li>・今回は間に合わなくても次回ねらえる制度</li>
        </ul>
      </Card>

      {/* 2. まず最初にやること（3STEP） */}
      <Card title="② まず最初にやること">
        <div className="grid gap-3 sm:grid-cols-3">
          <Step n="1" title="支出テーマを選ぶ" body="例：空調を入れ替えたい／看板を作りたい／ECを強化したい／AI・在庫管理を入れたい／人を採用したい" note="ここで選ぶのは「今日やる作業」ではありません。補助金を確認したい支出内容です。" />
          <Step n="2" title="補助金チェックを作る" body="どこで使うか／予算／実施予定時期／発注状況／会社情報を入力します。" />
          <Step n="3" title="今日やる申請準備を進める" body="発注前か確認する／公式サイトで条件を見る／見積もりを取る／GビズID確認／商工会議所に相談／対象になる費用の確認 など。" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/projects/new" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">支出テーマを選ぶ</Link>
          <Link href="/" className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">ホームへ</Link>
        </div>
      </Card>

      {/* 3. 支出テーマと今日やる申請準備の違い */}
      <Card title="③ 「支出テーマ」と「今日やる申請準備」の違い">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
            <p className="text-sm font-bold text-sky-900">支出テーマ＝何にお金を使う予定か</p>
            <p className="mt-1 text-xs text-sky-800">空調を入れ替えたい／看板を作りたい／広告を出したい／AI・在庫管理を入れたい</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-bold text-emerald-900">今日やる申請準備＝先に確認・準備すること</p>
            <p className="mt-1 text-xs text-emerald-800">発注前か確認する／公式サイトで条件を確認する／見積もりを取る／GビズID確認／従業員数の入力／商工会議所に相談</p>
          </div>
        </div>
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">注意：「空調」や「看板」は支出テーマ（使いみち）であって、今日やる作業ではありません。</p>
      </Card>

      {/* 4. 発注前チェックの重要性 */}
      <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 p-5">
        <h2 className="text-base font-bold text-red-800">④ いちばん大事なのは「発注の前」の確認です</h2>
        <p className="mt-1 text-sm leading-relaxed text-red-800">
          補助金を使うかもしれない支出は、<strong>契約・注文・支払いをする前</strong>に確認しましょう。
          多くの補助金では、申請の前に契約・注文・支払いをすると<strong>対象外</strong>になることがあります。
        </p>
        <ul className="mt-2 space-y-1 text-sm text-red-900">
          <li>🟠 <strong>まだ発注していない</strong>：公式サイトで条件を確認してから進めましょう</li>
          <li>🔵 <strong>見積もりだけ</strong>：まだ間に合うかもしれません</li>
          <li>🔴 <strong>契約・注文・支払い済み</strong>：その費用は対象外になることがあります（別の費用・次回の募集なら使えることも）</li>
        </ul>
      </div>

      {/* 自分のAIに相談する */}
      <div className="mb-4 rounded-xl border-2 border-violet-200 bg-violet-50/40 p-5">
        <h2 className="text-base font-bold text-violet-900">🤖 自分のAIに相談する</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">
          このサイトでは、ChatGPT・Claude・Geminiなどに貼って使える<strong>相談文</strong>を作れます。
          補助金名を知らなくても、支出・発注状況・定番制度の候補・今日やる申請準備を整理したうえで、AIに聞ける形にします。
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          <li>・自分のAIに貼って相談できます（このサイトでAIの利用料はかかりません）</li>
          <li>・「補助金について聞く／公式要領を読ませる／見積書をチェック／申請書の素材を作る／相談文を作る／支払い前の確認／実績報告の準備」ができます</li>
          <li>・AIに貼る前に、個人名・住所・金額など<strong>伏せたい情報は伏せられます</strong></li>
          <li>・AIの回答を<strong>貼り戻して参考メモ</strong>として残せます（確定情報にはしません）</li>
        </ul>
        <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs text-amber-800">
          AIの回答は申請可否・採択を保証しません。最終判断は必ず公式要領・自治体窓口・商工会議所・専門家に確認してください。
        </p>
        <p className="mt-2 text-xs text-gray-500">使う場所：各「補助金チェック」の詳細ページ →「🤖 自分のAIに相談する」</p>
      </div>

      {/* 5. まず確認すべき定番制度 */}
      <Card title="⑤ まず確認すべき定番制度" collapsible>
        <p className="text-sm text-gray-700">検索で見つかった制度だけでなく、中小企業・小規模事業者が一般的に確認すべき定番制度も登録した支出ごとに表示します。</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-gray-600">
          <div className="rounded border p-2"><b>AI・在庫管理・POS</b>：IT導入補助金／省力化投資補助金／ものづくり補助金</div>
          <div className="rounded border p-2"><b>広告・LP・看板</b>：小規模事業者持続化補助金／自治体の販路開拓補助金</div>
          <div className="rounded border p-2"><b>空調・設備</b>：省エネ・脱炭素系／自治体の設備導入／店舗改装系</div>
          <div className="rounded border p-2"><b>採用・研修</b>：業務改善助成金／キャリアアップ助成金／人材開発支援助成金</div>
        </div>
        <p className="mt-2 text-xs text-gray-500">※ このツールは「使える」と断定しません。「確認する価値あり」として表示します。最終的な判断は、公式サイトや専門家への確認が必要です。</p>
      </Card>

      {/* 6. 基本の使い方 */}
      <Card title="⑥ 基本の使い方" collapsible>
        <ol className="grid gap-1.5 text-sm text-gray-700 sm:grid-cols-2">
          {["ホームを見る", "今日やる申請準備を確認する", "補助金チェックを作る", "発注判断を確認する", "まず確認すべき定番制度を見る", "公式情報を確認する", "チェックリストを完了していく"].map((s, i) => (
            <li key={s} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{i + 1}</span>{s}</li>
          ))}
        </ol>
      </Card>

      {/* 7. よくある失敗 */}
      <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-5">
        <h2 className="text-base font-bold text-orange-800">⑦ よくある失敗</h2>
        <ul className="mt-2 space-y-1 text-sm text-orange-900">
          <li>・発注してから補助金に気づく</li>
          <li>・補助金の名前から探そうとして迷う</li>
          <li>・検索結果だけを信じてしまう</li>
          <li>・民間のまとめ記事を公式情報だと思ってしまう</li>
          <li>・締切日だけ見て、事前相談の期限を見落とす</li>
          <li>・従業員数や発注状況を入力せず、判定があいまいになる</li>
        </ul>
      </div>

      {/* 8. 管理者画面について */}
      <Card title="⑧ 管理者画面について" collapsible>
        <p className="text-sm text-gray-700">
          管理者画面では、検索結果の確認・公式情報の確認・ノイズ除外・制度情報の管理を行います。
          通常利用では、まず<strong>ホーム・補助金チェック・今日やる申請準備</strong>を見れば十分です。
        </p>
        <Link href="/discovery" className="mt-2 inline-block text-xs text-accent hover:underline">管理者画面を見る →</Link>
      </Card>

      <div className="mt-6 text-center">
        <Link href="/projects/new" className="rounded-md bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90">さっそく支出テーマを選ぶ →</Link>
      </div>
    </div>
  );
}

function Card({ title, children, collapsible }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  if (collapsible) {
    return (
      <details className="mb-4 rounded-xl border bg-white p-5">
        <summary className="cursor-pointer text-base font-bold text-ink">{title}</summary>
        <div className="mt-2">{children}</div>
      </details>
    );
  }
  return (
    <div className="mb-4 rounded-xl border bg-white p-5">
      <h2 className="mb-2 text-base font-bold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function Step({ n, title, body, note }: { n: string; title: string; body: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{n}</div>
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{body}</p>
      {note && <p className="mt-1 text-[11px] text-amber-700">{note}</p>}
    </div>
  );
}
