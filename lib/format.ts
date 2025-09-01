import type { Analysis } from './schema'

export function formatMarkdown(analysis: Analysis, opts: { meta?: any; level?: 'concise' | 'learning' } = {}) {
  const { meta, level = 'concise' } = opts
  const ex = analysis.extracted || {}
  const title = `現在の状況説明`
  const target = `対象：${ex.ticker ?? '不明'}（市場: ${ex.market ?? meta?.market ?? '不明'} / 時間軸: ${ex.timeframe ?? meta?.timeframe ?? '不明'}）`
  const trend = `トレンド構造：${analysis.rationale?.join('・') || '—'}`
  const sr = analysis.levels?.sr || { support: [], resistance: [] }
  const srLine = `主要レジサポ：S=${sr.support?.slice(0,3).join(', ') || '—'} / R=${sr.resistance?.slice(0,3).join(', ') || '—'}`
  const ob = analysis.orderbook || {}
  const obLine = `板：スプレッド=${ob.spread ?? '—'}、偏り=${typeof ob.imbalance==='number'? (ob.imbalance*100).toFixed(0)+'%':'—'}、圧力=${ob.pressure ?? '—'}`

  const base = [
    `# ${title}`,
    `- ${target}`,
    `- ${trend}`,
    `- ${srLine}`,
    `- ${obLine}`,
  ]

  const planTitle = `推奨される売買とその理由（教育目的）`
  const decisionLine = `結論：${analysis.decision}（${analysis.horizon}）`
  const entry = analysis.levels?.entry != null ? `${analysis.levels.entry}` : '—'
  const sl = analysis.levels?.sl != null ? `${analysis.levels.sl}` : '—'
  const tp = Array.isArray(analysis.levels?.tp) ? analysis.levels!.tp!.slice(0,3).join(', ') : '—'
  const reasons = (analysis.rationale || []).slice(0,5).map(r => `- ${r}`).join('\n') || '- —'
  const plan = [
    `# ${planTitle}`,
    decisionLine,
    `- エントリー: ${entry}`,
    `- 無効化（損切）: ${sl}`,
    `- 利確候補: ${tp}`,
    `- 根拠:\n${reasons}`,
  ]

  const risk = [
    `# リスク管理プラン`,
    `- 想定資金/許容損失: ${meta?.capital ?? '—'} / ${meta?.riskPct ?? '—'}%（仮定可）`,
    `- 信頼度: ${(analysis.confidence*100).toFixed(0)}%`,
    ...(analysis.notes?.length ? [`- 注意: ${analysis.notes.join(' / ')}`] : []),
  ]

  const summary = [
    `# まとめ`,
    `- ${analysis.decision}（${analysis.horizon}）`,
    `- S/R: S=${sr.support?.[0] ?? '—'} / R=${sr.resistance?.[0] ?? '—'}`,
    `- 次に欲しい情報：時間軸の明示、直近イベント（決算/指標）`
  ]

  if (level === 'concise') {
    return [...base, ...plan, ...summary].join('\n')
  }
  // learning: add a bit more guidance text
  const learnSections: string[] = []
  // Invalidation & alternatives (if scenarios available)
  const sc: any = (analysis as any).scenarios || {}
  const invalid = analysis.levels?.sl != null ? `${analysis.levels.sl}` : (sc.base?.sl ?? sc.bull?.sl ?? sc.bear?.sl ?? '—')
  const altLines: string[] = []
  if (sc.bull) altLines.push(`- 強気: 条件=${sc.bull.conditions ?? '—'} / SL=${sc.bull.sl ?? '—'} / TP=${Array.isArray(sc.bull.tp)? sc.bull.tp.slice(0,2).join(', '): '—'}`)
  if (sc.bear) altLines.push(`- 弱気: 条件=${sc.bear.conditions ?? '—'} / SL=${sc.bear.sl ?? '—'} / TP=${Array.isArray(sc.bear.tp)? sc.bear.tp.slice(0,2).join(', '): '—'}`)
  learnSections.push(`# 否定条件と代替シナリオ`)
  learnSections.push(`- 無効化ライン（損切）: ${invalid}`)
  if (altLines.length) learnSections.push(...altLines)

  const learn = [
    `> 学習メモ: トレンド方向と出来高/板の裏付けが一致した時のみ積極的。否定ライン（損切）を先に置き、RRが1.5以上見込めない場合は見送りも選択肢。`,
  ]
  return [...base, ...plan, ...risk, ...learnSections, ...learn, ...summary].join('\n')
}
