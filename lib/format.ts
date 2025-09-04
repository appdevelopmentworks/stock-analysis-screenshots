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
  const decisionSafe = (analysis as any).decision ?? 'hold'
  const horizonSafe = (analysis as any).horizon ?? 'intraday'
  const decisionLine = `結論：${decisionSafe}（${horizonSafe}）`
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

  // Fundamentals summary (if present)
  const f: any = (analysis as any).fundamentals || {}
  const fundamentals: string[] = []
  if (Object.keys(f).length) {
    fundamentals.push(`# ファンダメンタル要約`)
    const kpi: string[] = []
    if (f.revenue != null) kpi.push(`売上: ${f.revenue}`)
    if (f.operatingIncome != null) kpi.push(`営業益: ${f.operatingIncome}`)
    if (f.netIncome != null) kpi.push(`純益: ${f.netIncome}`)
    if (f.eps != null) kpi.push(`EPS: ${f.eps}`)
    if (kpi.length) fundamentals.push(`- KPI: ${kpi.join(' / ')}`)
    if (f.valuation && (f.valuation.per!=null || f.valuation.pbr!=null || f.valuation.dividendYield!=null)) {
      fundamentals.push(`- Valuation: PER=${f.valuation.per ?? '—'} / PBR=${f.valuation.pbr ?? '—'} / 配当利回り=${f.valuation.dividendYield ?? '—'}`)
    }
    if (Array.isArray(f.highlights) && f.highlights.length) fundamentals.push(`- ポジ要因: ${f.highlights.slice(0,3).join(' / ')}`)
    if (Array.isArray(f.risks) && f.risks.length) fundamentals.push(`- リスク: ${f.risks.slice(0,3).join(' / ')}`)
  }

  const risk = [
    `# リスク管理プラン`,
    `- 想定資金/許容損失: ${meta?.capital ?? '—'} / ${meta?.riskPct ?? '—'}%（仮定可）`,
    `- 信頼度: ${(analysis.confidence*100).toFixed(0)}%`,
    ...(analysis.notes?.length ? [`- 注意: ${analysis.notes.join(' / ')}`] : []),
  ]

  const summary = [
    `# まとめ`,
    `- ${decisionSafe}（${horizonSafe}）`,
    `- S/R: S=${sr.support?.[0] ?? '—'} / R=${sr.resistance?.[0] ?? '—'}`,
    `- 次に欲しい情報：時間軸の明示、直近イベント（決算/指標）`
  ]

  if (level === 'concise') {
    return [...base, ...fundamentals, ...plan, ...summary].filter(Boolean).join('\n')
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
  return [...base, ...fundamentals, ...plan, ...risk, ...learnSections, ...learn, ...summary].filter(Boolean).join('\n')
}

export function formatScenarioMarkdown(analysis: any) {
  const sc = analysis?.scenarios || {}
  const title = '# シナリオ要約'
  const lines: string[] = [title]
  const one = (key: 'base'|'bull'|'bear', label: string) => {
    if (!sc[key]) return
    const s = sc[key]
    const tp = Array.isArray(s.tp) ? s.tp.slice(0,3).join(', ') : '—'
    lines.push(`## ${label}`)
    if (s.conditions) lines.push(`- 条件: ${s.conditions}`)
    lines.push(`- Entry: ${s.entry ?? '—'}`)
    lines.push(`- SL(無効化): ${s.sl ?? '—'}`)
    lines.push(`- TP候補: ${tp}`)
    if (Array.isArray(s.rationale) && s.rationale.length) {
      lines.push(`- 根拠:`)
      for (const r of s.rationale.slice(0,3)) lines.push(`  - ${r}`)
    }
    if (s.rr != null) lines.push(`- 想定RR: ${s.rr}`)
  }
  one('base', 'ベース')
  one('bull', '強気')
  one('bear', '弱気')
  return lines.join('\n')
}
