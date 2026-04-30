// Mirror of engramia/providers/roles.py KNOWN_ROLES.
// Updates here MUST stay in sync with the Core repo per the cross-repo
// invariants table in workspace CLAUDE.md.

export const KNOWN_ROLES = [
  "default",
  "eval",
  "architect",
  "coder",
  "evolve",
  "recall",
] as const;

export type KnownRole = (typeof KNOWN_ROLES)[number];

export const ROLE_DESCRIPTIONS: Record<KnownRole, string> = {
  default: "Generic fallback for any LLM call without an explicit role hint.",
  eval: "Quality scoring inside MultiEvaluator — pick a fast, cheap model.",
  architect:
    "High-level decomposition + prompt-evolution planning — pick a quality model.",
  coder: "Final code synthesis after decomposition — pick a strong code model.",
  evolve:
    "Candidate-generation passes inside PromptEvolver — quality > speed.",
  recall:
    "Reserved for future LLM rerank in hybrid recall — currently unused.",
};

// Suggested models per provider for the autocomplete dropdown. Free-form
// entries are still allowed — this list is UX, not validation.
export const KNOWN_MODELS: Record<string, string[]> = {
  openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "gpt-5"],
  anthropic: [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash"],
  ollama: ["llama3.3", "qwen2.5:32b", "mistral-small"],
  openai_compat: [],
};
