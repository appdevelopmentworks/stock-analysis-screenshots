export default function HelpPage() {
  return (
    <main className="container mx-auto p-4 max-w-3xl prose prose-invert">
      <h1>使い方</h1>
      <ol>
        <li>ホームでスクリーンショット画像を選択します（複数可）。</li>
        <li>必要に応じて「設定」でプロバイダ/モデルや前処理を調整します。</li>
        <li>「解析する」を押すと、抽出→要約の順に進み、結果が表示されます。</li>
      </ol>
      <h2>モバイルでの表示</h2>
      <p>
        解析後、「結果を別ページで開く」を押すと、結果のみを全画面表示で閲覧できます。左上の「ホーム」から戻れます。
      </p>
      <h2>よくある問題</h2>
      <ul>
        <li>APIキー未復号: 設定でPINを入力し「復号」を押してください。</li>
        <li>モデルエラー: プロバイダとモデルの組み合わせをご確認ください。</li>
      </ul>
    </main>
  )
}

