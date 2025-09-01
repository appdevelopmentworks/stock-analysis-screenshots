# スクショ解析ハイブリッド投資アドバイザ（MVP）要件定義 v0.1

## 目的・価値
- ユーザーがスマホのスクショ（チャート/板/ファンダ）を送るだけで、短時間に実用的な売買方針と根拠を提示。
- 入力の手間を最小化しつつ、学習にも役立つ解説を提供。KPIは初期は満足度最優先。

## 対象ユーザー
- 個人投資家（初〜中級）。日本株・米株の短中期トレード。暗号資産はテクニカル評価のみ対象。

## 対応市場・範囲（MVP）
- 市場: 日本株/米株（初期対応）。暗号資産はチャート＋インジのテクニカルのみ。
- タイムフレーム: 1分〜日足（MVP推奨は5分/15分/日足）。
- 対応スクショ: チャート、板（オーダーブック）。ファンダ画面は次フェーズ。

## 入力
- 形式: jpg/png。長辺≥1080px推奨。1リクエストで複数枚（例: チャート+板）。
- メタ: 市場/ティッカー/時間軸/取引スタイル（未入力はOCR/推定→不足のみ質問）。
- 前処理: 回転補正/リサイズ/圧縮（クライアント）。ダーク/ライトUI、ウォーターマーク耐性。

## 出力（表示+構造化JSON）
- 結論: 買い/売り/様子見 + 期間（スキャル/デイトレ/1–3日/スイング）。
- 根拠: トレンド、S/R、パターン、出来高、板圧力（暗号資産はテクニカル限定）。
- プラン: 目線/エントリ/損切/利確。シナリオ分岐（ベース/強気/弱気）と無効化ライン。
- リスク: 否定条件・イベント（決算/指標）・流動性/スリッページ所見。
- 信頼度: 0–100（画像品質/抽出一貫性/市場整合で調整）。
- 免責: 情報提供目的で投資助言ではない旨。

## KPI / 非機能
- KPI: 満足度を最優先（出力品質・納得感）。
- レイテンシ目標: 3–8秒（MVPは≤10秒）。同時100リクエスト目安。
- 可用性: 99.5%/月（MVP）。
- コスト: ユーザー持込キー利用（OpenAI/Groq）。
- 画像/キーのサーバ保存なし（処理中のみメモリ保持）。

## 技術アーキテクチャ
- クライアント: Next.js 15（App Router）+ TailwindCSS + shadcn/ui + framer-motion + PWA。
- デプロイ: 最終的に Vercel。Edge Runtime を優先利用。
- API（Edge Routes）:
  - `POST /api/analyze`: 画像(複数)+メタ+設定 → 構造化JSON+要約（ストリーミング）
  - `POST /api/proxy/openai` / `POST /api/proxy/groq`: キー持込パススルー（保存なし、ヘッダマスキング）
- データ永続化: サーバDBなし。履歴は端末側（IndexedDB）オプション。

## モデル方針（プロファイル）
- 既定（Balanced）: 画像=Groq `meta-llama/llama-4-maverick-17b-128e-instruct`、テキスト=Groq `openai/gpt-oss-120b`。
- Fast: 画像=Groq maverick、テキスト=OpenAI `gpt-4o-mini`。
- Quality: 画像=OpenAI `gpt-4o`、テキスト=Groq `openai/gpt-oss-120b`。
- 切替: 設定でプロバイダ/モデル選択。テストは Groq をメイン使用。遅延/品質のトレードオフを説明表示。

## データスキーマ（MVP）
```
{
  "decision": "buy|sell|hold",
  "horizon": "scalp|intraday|1-3d|swing",
  "rationale": ["string"],
  "levels": {
    "entry": 0,
    "sl": 0,
    "tp": [0],
    "sr": { "support": [0], "resistance": [0] }
  },
  "orderbook": {
    "spread": 0,
    "imbalance": 0,
    "pressure": "bid|ask|neutral",
    "levels": [{ "price": 0, "bid": 0, "ask": 0 }]
  },
  "extracted": { "ticker": "", "market": "JP|US|CRYPTO", "timeframe": "" },
  "fundamentals": {
    "valuation": { "per": 0, "pbr": 0, "ev_ebitda": 0 },
    "growth": { "rev_yoy": 0, "eps_yoy": 0 },
    "profitability": { "roe": 0, "opm": 0 },
    "financials": { "equity_ratio": 0, "debt_equity": 0 },
    "guidance": "",
    "events": ["string"]
  },
  "confidence": 0.0,
  "notes": ["string"]
}
```

## 分析ロジック（MVP）
- チャート: MA/EMAの傾き、直近高安・水平S/R、自動トレンドライン、出来高急増、単純パターン（ブレイク/リトレース）。
- 板: スプレッド、厚み/偏り（Imbalance）、指値集中、飛び、不自然値の除外。
- 暗号資産: テクニカルのみ（インジと価格行動）。
- 整合性: テクニカルと板の方向一致時のみ強い推奨。曖昧は様子見。

## プロンプト設計（統合仕様）
- 抽出（Vision）: 種別（チャート/板/混在）、市場/銘柄/時間軸、S/R、出来高イベント、インジ値、板のスプレッド/厚み/偏りをJSONで返す（不明はnull/理由付き）。SBI/楽天/松井UIの正規化ルールを含む。
- 意思決定（Text）: 入力特徴から 3シナリオと無効化ライン、`levels`一貫性チェック、`confidence` を生成。トーン切替（端的/学習）。
- 出力フォーマット: 参考インストラクション（docs/instructions.md）準拠。事実/推定の区別、JST表記、レベル適応、リスク管理の明示。

## セキュリティ/プライバシー/キー運用
- キー持込パススルー（Edgeで`X-API-Key`受領→保存せず上流転送）。ログはヘッダマスク・本文記録なし。
- 画像は処理中のみ保持→応答後即破棄。監査ログにも画像データを残さない。
- クライアント保存: APIキーは`localStorage`暗号化（Web Crypto）+ クリアUI。履歴はIndexedDB任意。
- CORS: 自前プロキシ経由のみ許可（上流直叩き不可）。

## UX/画面（shadcn/ui）
- UploadCard: 画像ドロップ/選択、圧縮プレビュー、メタ補足。
- SettingsSheet: プロバイダ/モデル/コスト優先/トーン/市場既定、APIキー保存。
- ResultPane: 結論カード→S/R/板ヒート→要約、JSONコピー、再評価ボタン。
- HistoryDrawer: 端末内履歴、再利用。
- アニメーション: framer-motion で段階表示、信頼度バー。

## PWA/デプロイ
- PWA: `manifest.json`、Service Worker、ホーム画面追加、最低限オフライン（履歴/設定のみ）。
- デプロイ: Vercel。Edge Functions優先。環境変数不要（ユーザー持込キーのため）。

## APIインターフェース概要
- `POST /api/analyze`
  - 入力: `multipart/form-data`（`files[]`=画像, `meta`=JSON, `provider`, `visionModel`, `textModel`, `tone`）
  - 出力: `text/event-stream` で段階（extraction→decision→summary）または `application/json` 完了レスポンス。
- `POST /api/proxy/{openai|groq}`
  - 入力: 上流互換のJSON。ヘッダ`X-API-Key`必須。
  - 出力: 上流のレスポンスをパススルー（キーのサーバ保存なし）。

## リスクと対策
- 板OCR誤読: 呼値/桁整合チェック、外れ値除外、二重抽出で一致率低は低信頼表示。
- 遅延: クライアント圧縮、画像1–2枚に制限、Vision/Text並列化、フェイルオーバー。
- 過信: 免責強調、見送り基準を常設、保守的デフォルト。
- 規制/表現: 投資助言ではない旨の明記。地域/年齢制限。

## 確定事項（確認済み）
- OpenAIモデルは性能重視で選択、レイテンシとトレードオフ考慮。テストは Groq をメイン。
- Edge プロキシのキー持込パススルー運用で合意。
- 暗号資産の取引所UI優先度なし。
- PWAは初期から有効化。
- 対応アプリUI: SBI/楽天/松井を優先最適化。
- 板は初期から対応、ファンダは次フェーズで段階導入。

## 次の一歩
- 主要スクショ10–20枚（SBI/楽天/松井: チャート/板/暗号資産チャート）を基準セットとして共有。
- Next.js 15 プロジェクトの骨組み作成（ルーティング/コンポーネント雛形/API/プロンプト雛形/PWA）。
- ダミー応答→Groq接続→基準セットでの改善サイクル。

***
詳細な出力テンプレや運用上のガイドは docs/instructions.md を参照してください。
