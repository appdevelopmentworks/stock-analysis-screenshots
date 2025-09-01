import { z } from 'zod'

export const SRSchema = z.object({
  support: z.array(z.number()).default([]),
  resistance: z.array(z.number()).default([]),
})

export const OrderbookLevel = z.object({
  price: z.number(),
  bid: z.number().optional(),
  ask: z.number().optional(),
})

export const OrderbookSchema = z.object({
  spread: z.number().nullable().optional(),
  imbalance: z.number().nullable().optional(),
  pressure: z.enum(['bid', 'ask', 'neutral']).default('neutral'),
  levels: z.array(OrderbookLevel).default([]),
})

export const ExtractedSchema = z.object({
  ticker: z.string().nullable().optional(),
  market: z.enum(['JP', 'US', 'CRYPTO']).default('JP'),
  timeframe: z.string().nullable().optional(),
  uiSource: z.enum(['SBI', 'Rakuten', 'Matsui', 'TradingView', 'Unknown']).optional(),
})

export const AnalysisSchema = z.object({
  decision: z.enum(['buy', 'sell', 'hold']).default('hold'),
  horizon: z.enum(['scalp', 'intraday', '1-3d', 'swing']).default('intraday'),
  rationale: z.array(z.string()).default([]),
  levels: z.object({
    entry: z.number().optional(),
    sl: z.number().optional(),
    tp: z.array(z.number()).optional(),
    sr: SRSchema.default({ support: [], resistance: [] }),
  }).default({ sr: { support: [], resistance: [] } }),
  orderbook: OrderbookSchema.default({ pressure: 'neutral', levels: [] }),
  extracted: ExtractedSchema.default({ market: 'JP' }),
  confidence: z.number().min(0).max(1).default(0.3),
  notes: z.array(z.string()).default([]),
  scenarios: z
    .object({
      base: z
        .object({
          conditions: z.string().optional(),
          entry: z.number().optional(),
          sl: z.number().optional(),
          tp: z.array(z.number()).optional(),
          rationale: z.array(z.string()).optional(),
          rr: z.number().optional(),
        })
        .optional(),
      bull: z
        .object({
          conditions: z.string().optional(),
          entry: z.number().optional(),
          sl: z.number().optional(),
          tp: z.array(z.number()).optional(),
          rationale: z.array(z.string()).optional(),
          rr: z.number().optional(),
        })
        .optional(),
      bear: z
        .object({
          conditions: z.string().optional(),
          entry: z.number().optional(),
          sl: z.number().optional(),
          tp: z.array(z.number()).optional(),
          rationale: z.array(z.string()).optional(),
          rr: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
})

export type Analysis = z.infer<typeof AnalysisSchema>
