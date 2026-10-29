// The one price table every cost is computed from (US dollars, OpenAI's and apinoa's list prices, October 2026).
import type { Usage } from "./types.js";

export type Prices = {
  /** Per million tokens, by model, for a describe request (Responses). */
  responses: Record<string, { input: number; output: number }>;
  /** Per million tokens, by model, for a describe request on the flex tier. */
  flex: Record<string, { input: number; output: number }>;
  /** Per million input tokens, by model, for a Decisions request; its output is free. */
  decisions: Record<string, { input: number }>;
  /** Per minute of audio, by transcription model. */
  transcription: Record<string, number>;
  /** Per apinoa call. */
  apinoa: number;
};

export type PricesOverride = { [K in keyof Prices]?: Prices[K] };

export const PRICES: Prices = {
  responses: { "gpt-6-luna": { input: 0.1, output: 0.5 } },
  flex: { "gpt-6-luna": { input: 0.05, output: 0.25 } },
  decisions: { "gpt-6-luna": { input: 0.1 } },
  transcription: { "whisper-1": 0.006 },
  apinoa: 0.001,
};

/** The table with `override` merged over it, per model. */
export function withPrices(override: PricesOverride = {}): Prices {
  return {
    responses: { ...PRICES.responses, ...override.responses },
    flex: { ...PRICES.flex, ...override.flex },
    decisions: { ...PRICES.decisions, ...override.decisions },
    transcription: { ...PRICES.transcription, ...override.transcription },
    apinoa: override.apinoa ?? PRICES.apinoa,
  };
}

/** Dollars without float dust (to a billionth). */
export const usd = (x: number) => Math.round(x * 1e9) / 1e9;

const M = 1_000_000;

/** A describe request's cost: the engine's own, else its tokens at the table's price for `id` and tier (0 for an unknown id). */
export function responsesCost(prices: Prices, id: string, u: Usage = {}): number {
  if (u.costUsd !== undefined) return usd(u.costUsd);
  const p = u.serviceTier === "flex" ? prices.flex[id] : prices.responses[id];
  return p ? usd(((u.inputTokens ?? 0) * p.input + (u.outputTokens ?? 0) * p.output) / M) : 0;
}

/** A Decisions request's cost: input tokens only. */
export function decisionsCost(prices: Prices, id: string, u: Usage = {}): number {
  if (u.costUsd !== undefined) return usd(u.costUsd);
  const p = prices.decisions[id];
  return p ? usd(((u.inputTokens ?? 0) * p.input) / M) : 0;
}

/** A transcription's cost: per minute of audio. */
export function transcriptionCost(prices: Prices, id: string, u: Usage = {}): number {
  if (u.costUsd !== undefined) return usd(u.costUsd);
  const p = prices.transcription[id];
  return p ? usd(((u.audioSec ?? 0) / 60) * p) : 0;
}

export const apinoaCost = (prices: Prices, calls: number) => usd(calls * prices.apinoa);
