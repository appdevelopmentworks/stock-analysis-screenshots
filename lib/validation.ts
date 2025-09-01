import { Analysis } from './schema'

export type Market = 'JP' | 'US' | 'CRYPTO'

function isFiniteNumber(n: any): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function roundByMarket(n: number, market: Market) {
  if (!isFiniteNumber(n)) return n
  const digits = market === 'JP' ? 1 : 2
  const f = Math.pow(10, digits)
  return Math.round(n * f) / f
}

export function sanitizeSR(sr: any, market: Market) {
  const uniq = (arr: number[]) => Array.from(new Set(arr.filter(isFiniteNumber)))
  const support = uniq((sr?.support ?? []).map((v: number) => roundByMarket(v, market))).sort((a, b) => a - b)
  const resistance = uniq((sr?.resistance ?? []).map((v: number) => roundByMarket(v, market))).sort((a, b) => a - b)
  return { support, resistance }
}

export function normalizeOrderbook(ob: any, market: Market) {
  const levels = Array.isArray(ob?.levels) ? ob.levels : []
  const cleaned = levels
    .map((lv: any) => ({ price: Number(lv.price), bid: Number(lv.bid ?? 0), ask: Number(lv.ask ?? 0) }))
    .filter((lv: any) => isFiniteNumber(lv.price) && lv.price > 0)
    .map((lv: any) => ({ ...lv, price: snapToTick(roundByMarket(lv.price, market), market) }))

  // compute spread/pressure if missing
  const bids = cleaned.filter(l => l.bid > 0)
  const asks = cleaned.filter(l => l.ask > 0)
  const bestBid = bids.length ? Math.max(...bids.map(l => l.price)) : undefined
  const bestAsk = asks.length ? Math.min(...asks.map(l => l.price)) : undefined
  let spread: number | null = null
  if (isFiniteNumber(bestBid) && isFiniteNumber(bestAsk)) {
    spread = Math.max(0, roundByMarket(bestAsk! - bestBid!, market))
  }
  const bidSum = bids.reduce((a, b) => a + (isFiniteNumber(b.bid) ? b.bid : 0), 0)
  const askSum = asks.reduce((a, b) => a + (isFiniteNumber(b.ask) ? b.ask : 0), 0)
  const imbalance = bidSum + askSum > 0 ? (bidSum - askSum) / (bidSum + askSum) : 0
  const pressure: 'bid' | 'ask' | 'neutral' = imbalance > 0.1 ? 'bid' : imbalance < -0.1 ? 'ask' : 'neutral'
  return { levels: cleaned, spread, imbalance, pressure }
}

export function validateDecision(decision: any, market: Market): Analysis {
  const out: any = { ...decision }
  // Normalize horizon/decision fields
  if (!['buy', 'sell', 'hold'].includes(out.decision)) out.decision = 'hold'
  const horizons = ['scalp', 'intraday', '1-3d', 'swing']
  if (!horizons.includes(out.horizon)) out.horizon = 'intraday'
  // SR sanitize
  out.levels = out.levels || {}
  out.levels.sr = sanitizeSR(out.levels.sr, market)

  // Round numeric levels
  if (isFiniteNumber(out.levels.entry)) out.levels.entry = roundByMarket(out.levels.entry, market)
  if (isFiniteNumber(out.levels.sl)) out.levels.sl = roundByMarket(out.levels.sl, market)
  if (Array.isArray(out.levels.tp)) out.levels.tp = out.levels.tp.filter(isFiniteNumber).map((v: number) => roundByMarket(v, market))

  // Tick-size normalization (approximate)
  const snap = (v: number | undefined) => (isFiniteNumber(v) ? snapToTick(v!, market) : v)
  const entryOrig = out.levels.entry
  const slOrig = out.levels.sl
  out.levels.entry = snap(out.levels.entry)
  out.levels.sl = snap(out.levels.sl)
  if (Array.isArray(out.levels.tp)) out.levels.tp = out.levels.tp.map((v: number) => snapToTick(v, market))
  if (isFiniteNumber(entryOrig) && entryOrig !== out.levels.entry) out.notes.push('注: エントリ価格を呼値刻みに丸めました')
  if (isFiniteNumber(slOrig) && slOrig !== out.levels.sl) out.notes.push('注: 損切価格を呼値刻みに丸めました')

  // Confidence bounds
  if (!isFiniteNumber(out.confidence)) out.confidence = 0.5
  out.confidence = Math.max(0, Math.min(1, out.confidence))

  // Rationale length
  if (!Array.isArray(out.rationale)) out.rationale = []
  out.rationale = out.rationale.slice(0, 5)

  // Notes length
  if (!Array.isArray(out.notes)) out.notes = []

  return out
}

export function checkPlanConsistency(out: any, market: Market) {
  // Add soft checks and notes; do not overfit values, but ensure basic ordering.
  const notes: string[] = []
  const entry = out?.levels?.entry
  const sl = out?.levels?.sl
  const tps: number[] = out?.levels?.tp || []
  const sr = out?.levels?.sr || { support: [], resistance: [] }

  const nearestSupport = sr.support.slice().filter((v: number) => (typeof entry === 'number' ? v <= entry : true)).pop()
  const nearestResistance = sr.resistance.slice().find((v: number) => (typeof entry === 'number' ? v >= entry : true))

  if (out.decision === 'buy') {
    // SL should be below entry; TP above entry
    if (typeof entry === 'number' && typeof sl === 'number' && sl >= entry) {
      notes.push('警告: 損切がエントリ以上です。エントリ直下または直近サポート下に設定を検討。')
    }
    if (typeof entry === 'number' && Array.isArray(tps) && tps.some((tp) => tp <= entry)) {
      notes.push('警告: 利確候補にエントリ以下の値が含まれています。')
    }
    if (nearestSupport && typeof sl === 'number' && sl > nearestSupport) {
      notes.push('注意: 損切が直近サポートより上です。ノイズで狩られる可能性。')
    }
  } else if (out.decision === 'sell') {
    if (typeof entry === 'number' && typeof sl === 'number' && sl <= entry) {
      notes.push('警告: 損切がエントリ以下です。エントリ直上または直近レジスタンス上に設定を検討。')
    }
    if (typeof entry === 'number' && Array.isArray(tps) && tps.some((tp) => tp >= entry)) {
      notes.push('警告: 利確候補にエントリ以上の値が含まれています。')
    }
    if (nearestResistance && typeof sl === 'number' && sl < nearestResistance) {
      notes.push('注意: 損切が直近レジスタンスより下です。ノイズで狩られる可能性。')
    }
  }

  // Append notes (dedup)
  const set = new Set([...(out.notes || []), ...notes])
  out.notes = Array.from(set)
  return out
}

// --- Tick size helpers (approximate rules) ---
export function tickSizeForMarket(market: Market, price: number) {
  if (market === 'US' || market === 'CRYPTO') return 0.01
  // JP (東証の一般的な刻みの近似)
  if (price < 3_000) return 1
  if (price < 5_000) return 5
  if (price < 30_000) return 10
  if (price < 50_000) return 50
  if (price < 300_000) return 100
  if (price < 500_000) return 500
  if (price < 3_000_000) return 1_000
  if (price < 5_000_000) return 5_000
  return 10_000
}

export function snapToTick(value: number, market: Market) {
  const t = tickSizeForMarket(market, value)
  return Math.round(value / t) * t
}

export function enforceOrderbookTicks(ob: any, market: Market) {
  const levels = Array.isArray(ob?.levels) ? ob.levels : []
  let adjusted = 0
  const out = levels.map((lv: any) => {
    const orig = Number(lv.price)
    const snapped = snapToTick(orig, market)
    if (isFiniteNumber(orig) && orig !== snapped) adjusted++
    return { ...lv, price: snapped }
  })
  return { levels: out, adjusted }
}
