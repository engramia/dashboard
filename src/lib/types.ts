// ── Change password (required after manual onboarding) ──
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  access_token: string;
  must_change_password: boolean;
}

// ── Account deletion (self-service) ──
export interface DeletionRequestBody {
  reason?: string;
}

export interface DeletionRequestResponse {
  expires_at: string;
  delivery_status: "sent" | "failed";
}

export interface DeletionConfirmResponse {
  deleted: true;
  tenant_id: string;
  patterns_deleted: number;
  keys_revoked: number;
  stripe_subscription_cancelled: boolean;
}

// ── Health ──
export interface HealthResponse {
  status: string;
  storage: string;
  pattern_count: number;
}

export interface DeepHealthCheckResult {
  status: "ok" | "error" | "not_configured";
  latency_ms: number;
  error: string | null;
}

export interface DeepHealthResponse {
  status: "ok" | "degraded" | "error";
  version: string;
  uptime_seconds: number;
  checks: Record<string, DeepHealthCheckResult>;
}

// ── Metrics ──
export interface MetricsResponse {
  runs: number;
  success_rate: number;
  avg_eval_score: number | null;
  pattern_count: number;
  reuse_rate: number;
}

// ── Patterns / Recall ──
export interface PatternOut {
  task: string;
  code: string | null;
  success_score: number;
  reuse_count: number;
}

export interface MatchOut {
  similarity: number;
  reuse_tier: string;
  pattern_key: string;
  pattern: PatternOut;
}

export const REUSE_TIER_DESCRIPTIONS: Record<string, string> = {
  duplicate:
    "Near-identical match (similarity ≥ 92%) — pattern can be reused as-is.",
  adapt:
    "Similar match (similarity ≥ 70%) — pattern should be adapted to the new task.",
  fresh:
    "No close match (similarity < 70%) — treat as a new task; learn from scratch.",
};

export interface RecallRequest {
  task: string;
  limit?: number;
  deduplicate?: boolean;
  eval_weighted?: boolean;
}

export interface RecallResponse {
  matches: MatchOut[];
}

// ── Learn ──
export interface LearnRequest {
  task: string;
  code: string;
  eval_score: number;
  output?: string | null;
  run_id?: string | null;
  classification?: string;
  source?: string;
}

export interface LearnResponse {
  stored: boolean;
  pattern_count: number;
}

// ── Evaluate ──
export interface EvalScoreOut {
  task_alignment: number;
  code_quality: number;
  workspace_usage: number;
  robustness: number;
  overall: number;
  feedback: string;
}

export interface EvaluateResponse {
  median_score: number;
  variance: number;
  high_variance: boolean;
  feedback: string;
  adversarial_detected: boolean;
  scores: EvalScoreOut[];
}

// ── Feedback ──
export interface FeedbackResponse {
  feedback: string[];
}

// ── Analytics / ROI ──
export interface RecallOutcomeOut {
  total: number;
  duplicate_hits: number;
  adapt_hits: number;
  fresh_misses: number;
  reuse_rate: number;
  avg_similarity: number;
}

export interface LearnSummaryOut {
  total: number;
  avg_eval_score: number;
  p50_eval_score: number;
  p90_eval_score: number;
}

export interface ROIRollupResponse {
  tenant_id: string;
  project_id: string;
  window: string;
  window_start: string;
  recall: RecallOutcomeOut;
  learn: LearnSummaryOut;
  roi_score: number;
  computed_at: string;
}

export interface ROIRollupListResponse {
  window: string;
  rollups: ROIRollupResponse[];
}

export interface ROIEventOut {
  kind: string;
  ts: number;
  eval_score: number | null;
  similarity: number | null;
  reuse_tier: string | null;
  pattern_key: string;
}

export interface ROIEventsResponse {
  events: ROIEventOut[];
  total: number;
}

// ── Keys ──
export interface KeyInfo {
  id: string;
  name: string;
  key_prefix: string;
  role: string;
  tenant_id: string;
  project_id: string;
  max_patterns: number | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

export interface KeyListResponse {
  keys: KeyInfo[];
}

export interface KeyCreateRequest {
  name: string;
  role?: string;
  max_patterns?: number | null;
  expires_at?: string | null;
}

export interface KeyCreateResponse {
  id: string;
  name: string;
  key: string;
  key_prefix: string;
  role: string;
  tenant_id: string;
  project_id: string;
  max_patterns: number | null;
  created_at: string;
}

export interface KeyRevokeResponse {
  id: string;
  revoked: boolean;
}

export interface KeyRotateResponse {
  id: string;
  key: string;
  key_prefix: string;
}

// ── Jobs ──
export interface JobResponse {
  id: string;
  operation: string;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobListResponse {
  jobs: JobResponse[];
}

export interface JobCancelResponse {
  cancelled: boolean;
  job_id: string;
}

// ── Governance ──
export interface RetentionPolicyResponse {
  tenant_id: string;
  project_id: string;
  retention_days: number;
  source: string;
}

export interface RetentionApplyResponse {
  purged_count: number;
  dry_run: boolean;
}

export interface ScopedDeleteResponse {
  tenant_id: string;
  project_id: string;
  patterns_deleted: number;
  jobs_deleted: number;
  keys_revoked: number;
  projects_deleted: number;
}

export interface ClassifyPatternResponse {
  pattern_key: string;
  classification: string;
}

export interface DeletePatternResponse {
  deleted: boolean;
  pattern_key: string;
}

// ── Billing ──
// plan_tier values mirror engramia/billing/models.py PLAN_LIMITS keys.
// "sandbox" is the legacy free-tier name preserved as an alias of
// "developer" for any pre-6.6 row migration 024 missed.
export interface BillingStatus {
  plan_tier: "sandbox" | "developer" | "pro" | "team" | "business" | "enterprise";
  status: string;
  billing_interval: "month" | "year";
  eval_runs_used: number;
  eval_runs_limit: number | null;
  patterns_used: number;
  patterns_limit: number | null;
  projects_used: number;
  projects_limit: number | null;
  period_end: string | null;
  overage_enabled: boolean;
  overage_budget_cap_cents: number | null;
  cancel_at_period_end: boolean;
}

export interface BillingPortalResponse {
  portal_url: string;
}

export type BillingPlan = "pro" | "team" | "business";
export type BillingInterval = "monthly" | "yearly";

export interface BillingCheckoutRequest {
  plan: BillingPlan;
  interval: BillingInterval;
  success_url: string;
  cancel_url: string;
  customer_email?: string;
}

export interface BillingCheckoutResponse {
  checkout_url: string;
}

// ── Audit ──
export interface AuditEvent {
  timestamp: string;
  action: string;
  actor: string | null;
  resource_type: string | null;
  resource_id: string | null;
  ip: string | null;
  detail: Record<string, unknown> | null;
}

export interface AuditResponse {
  events: AuditEvent[];
  total: number;
}

// ── Credentials (BYOK, Phase 6.6) ──
export type CredentialProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openai_compat";

export type CredentialPurpose = "llm" | "embedding" | "both";

export type CredentialStatus = "active" | "revoked" | "invalid";

// One Ollama model entry returned by GET /v1/credentials/{id}/models.
// Mirrors engramia.providers._ollama_native.OllamaModel — see Phase 6.6 #4.
export interface OllamaModelInfo {
  name: string;
  size_bytes: number | null;
  param_count: string | null;  // e.g. "7B", "70B"
  quantization: string | null; // e.g. "Q4_K_M"
}

export interface OllamaModelsResponse {
  models: OllamaModelInfo[];
  fetched_at: string;       // ISO-8601 UTC
  from_cache: boolean;       // false when force_refresh hit the network
}

export interface CredentialPublicView {
  id: string;
  provider: CredentialProvider;
  purpose: CredentialPurpose;
  key_fingerprint: string;
  base_url: string | null;
  default_model: string | null;
  default_embed_model: string | null;
  role_models: Record<string, string>;
  failover_chain: string[];
  /** Per-role monthly cents cap (#2b). Empty = no ceilings. */
  role_cost_limits: Record<string, number>;
  status: CredentialStatus;
  last_used_at: string | null;
  last_validated_at: string | null;
  last_validation_error: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CredentialCreateRequest {
  provider: CredentialProvider;
  purpose: CredentialPurpose;
  api_key: string;
  base_url?: string | null;
  default_model?: string | null;
  default_embed_model?: string | null;
}

export interface CredentialUpdateRequest {
  base_url?: string | null;
  default_model?: string | null;
  default_embed_model?: string | null;
}

// Phase 6.6 #2: Business+ tier-gated sub-resources.
// Both endpoints require an ``If-Match`` header (ETag from `updated_at`).
export interface RoleModelsUpdateRequest {
  role_models: Record<string, string>;
}

export interface FailoverChainUpdateRequest {
  failover_chain: string[];
}

export interface RoleCostLimitsUpdateRequest {
  role_cost_limits: Record<string, number>;
}
