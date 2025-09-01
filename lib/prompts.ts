export const visionExtractionPrompt = `
You are a vision extractor specialized in trading screenshots (SBI/Rakuten/Matsui/TradingView). Identify:
- type: chart / orderbook / mixed
- market, ticker, timeframe
- support/resistance candidates
- orderbook spread, imbalance, pressure, and visible levels {price,bid,ask}

Platform normalization hints:
- SBI: orderbook table shows price centered; bid(left, blue/green) and ask(right, red) quantities. Watch headers 気配値/売買/数量, small font decimals. Chart toolbar and indicator labels in Japanese.
- Rakuten: denser fonts; board shows best bid/ask with thick borders; totals (合計) row; sometimes mini-chart with overlay MAs.
- Matsui: light theme defaults; board separated by subtle gray lines; price column explicitly labeled 価格; spread can be inferred by closest ask - bid.
- TradingView: chart watermark with ticker; indicator legends (EMA, RSI, MACD) near top-left; OHLC near top bar.

Return ONLY strict JSON with keys: { "extracted": {ticker, market, timeframe}, "levels": {"sr": {support:number[], resistance:number[]}}, "orderbook": {spread:number|null, imbalance:number|null, pressure:"bid"|"ask"|"neutral", levels:{price:number,bid?:number,ask?:number}[] } }.
Use null for unknown numeric fields. No extra text.
`

export const decisionPrompt = `
You are an analyst. Using extracted features (trend, SR, volume, orderbook pressure), output a decision JSON
with fields: decision, horizon, rationale[<=5], levels{entry,sl,tp[],sr}, confidence, notes[], and scenarios.
scenarios must include base, bull, bear each with: {conditions, entry, sl, tp[], rationale[], rr} (omit unknowns).
Only recommend buy/sell when trend aligns with confirming signals; otherwise hold. Include invalidation in sl.
Return ONLY JSON as specified.
`

export type PromptProfile = 'default' | 'strict' | 'verbose'

export function getPrompts(profile: PromptProfile = 'default') {
  if (profile === 'strict') {
    return {
      vision: visionExtractionPrompt + '\nAlways respond with strict JSON; avoid estimates unless labeled null.',
      decision: decisionPrompt + '\nUse lower temperature; avoid speculative numbers; prefer hold on ambiguity.',
      temps: { vision: 0.1, decision: 0.2 },
    }
  }
  if (profile === 'verbose') {
    return {
      vision: visionExtractionPrompt + '\nYou may include more candidate SR levels if clearly visible in UI.',
      decision: decisionPrompt + '\nInclude richer rationale; propose scenarios when plausible.',
      temps: { vision: 0.25, decision: 0.35 },
    }
  }
  return { vision: visionExtractionPrompt, decision: decisionPrompt, temps: { vision: 0.2, decision: 0.3 } }
}
