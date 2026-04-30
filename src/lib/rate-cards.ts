// Mirror of engramia/billing/rate_cards.py — UI-only.
// Used to show "$X.XX/M tokens" tooltips next to model autocomplete on
// the cost-ceiling editor. Update on every Core PR that bumps prices
// (cross-repo invariants table in workspace CLAUDE.md).

export interface ModelRate {
  input_per_1m_cents: number;
  output_per_1m_cents: number;
}

export const RATE_CARD: Record<string, Record<string, ModelRate>> = {
  openai: {
    "gpt-5": { input_per_1m_cents: 250, output_per_1m_cents: 1000 },
    "gpt-4.1": { input_per_1m_cents: 200, output_per_1m_cents: 800 },
    "gpt-4.1-mini": { input_per_1m_cents: 40, output_per_1m_cents: 160 },
    "gpt-4o": { input_per_1m_cents: 250, output_per_1m_cents: 1000 },
    "gpt-4o-mini": { input_per_1m_cents: 15, output_per_1m_cents: 60 },
  },
  anthropic: {
    "claude-opus-4-7": { input_per_1m_cents: 1500, output_per_1m_cents: 7500 },
    "claude-sonnet-4-6": { input_per_1m_cents: 300, output_per_1m_cents: 1500 },
    "claude-haiku-4-5": { input_per_1m_cents: 80, output_per_1m_cents: 400 },
  },
  gemini: {
    "gemini-2.5-pro": { input_per_1m_cents: 125, output_per_1m_cents: 1000 },
    "gemini-2.5-flash": { input_per_1m_cents: 30, output_per_1m_cents: 250 },
  },
};

export const RATE_CARD_REVIEWED = "2026-04-30";

/** Format cents as a dollar string with two decimals (e.g. 5000 -> "$50.00"). */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/** True when the (provider, model) pair has a rate-card entry. */
export function hasRateCard(provider: string, model: string): boolean {
  return Boolean(RATE_CARD[provider]?.[model]);
}
