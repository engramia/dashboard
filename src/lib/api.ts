import type {
  HealthResponse,
  DeepHealthResponse,
  MetricsResponse,
  RecallRequest,
  RecallResponse,
  FeedbackResponse,
  ROIRollupResponse,
  ROIRollupListResponse,
  ROIEventsResponse,
  KeyListResponse,
  KeyCreateRequest,
  KeyCreateResponse,
  KeyRevokeResponse,
  KeyRotateResponse,
  JobListResponse,
  JobResponse,
  JobCancelResponse,
  RetentionPolicyResponse,
  RetentionApplyResponse,
  ScopedDeleteResponse,
  ClassifyPatternResponse,
  DeletePatternResponse,
  AuditResponse,
  DeletionRequestBody,
  DeletionRequestResponse,
  BillingStatus,
  BillingPortalResponse,
  BillingCheckoutRequest,
  BillingCheckoutResponse,
  CredentialPublicView,
  CredentialCreateRequest,
  CredentialUpdateRequest,
  RoleCostLimitsUpdateRequest,
  RoleModelsUpdateRequest,
  FailoverChainUpdateRequest,
  OllamaModelsResponse,
} from "./types";

export class ApiError extends Error {
  // ``errorCode`` mirrors the ``error_code`` field on Engramia's structured
  // error body (see api/errors.py). Lets the UI branch on a stable code
  // (e.g. ``ENTITLEMENT_REQUIRED``) instead of parsing the human message.
  public errorCode?: string;
  public errorContext?: Record<string, unknown>;

  constructor(
    public status: number,
    public detail: string,
    errorCode?: string,
    errorContext?: Record<string, unknown>,
  ) {
    super(detail);
    this.name = "ApiError";
    this.errorCode = errorCode;
    this.errorContext = errorContext;
  }
}

export class EngramiaClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(extraHeaders ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(
        res.status,
        err.detail ?? "Unknown error",
        err.error_code,
        err.error_context,
      );
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return res.json();
  }

  // Health
  health() {
    return this.request<HealthResponse>("GET", "/v1/health");
  }
  healthDeep() {
    return this.request<DeepHealthResponse>("GET", "/v1/health/deep");
  }

  // Metrics
  metrics() {
    return this.request<MetricsResponse>("GET", "/v1/metrics");
  }

  // Patterns / Recall
  recall(req: RecallRequest) {
    return this.request<RecallResponse>("POST", "/v1/recall", req);
  }
  deletePattern(key: string) {
    return this.request<DeletePatternResponse>(
      "DELETE",
      `/v1/patterns/${key}`,
    );
  }

  // Feedback
  feedback(limit = 10) {
    return this.request<FeedbackResponse>(
      "GET",
      `/v1/feedback?limit=${limit}`,
    );
  }

  // Analytics
  rollup(window: string) {
    return this.request<ROIRollupResponse>(
      "GET",
      `/v1/analytics/rollup/${window}`,
    );
  }
  triggerRollup(window = "daily") {
    return this.request<ROIRollupListResponse>("POST", "/v1/analytics/rollup", {
      window,
    });
  }
  events(limit = 100, since?: number) {
    let url = `/v1/analytics/events?limit=${limit}`;
    if (since) url += `&since=${since}`;
    return this.request<ROIEventsResponse>("GET", url);
  }

  // Keys
  listKeys() {
    return this.request<KeyListResponse>("GET", "/v1/keys");
  }
  createKey(req: KeyCreateRequest) {
    return this.request<KeyCreateResponse>("POST", "/v1/keys", req);
  }
  revokeKey(id: string) {
    return this.request<KeyRevokeResponse>("DELETE", `/v1/keys/${id}`);
  }
  rotateKey(id: string) {
    return this.request<KeyRotateResponse>("POST", `/v1/keys/${id}/rotate`);
  }

  // Jobs
  listJobs(status?: string, limit = 20) {
    let url = `/v1/jobs?limit=${limit}`;
    if (status) url += `&status=${status}`;
    return this.request<JobListResponse>("GET", url);
  }
  getJob(id: string) {
    return this.request<JobResponse>("GET", `/v1/jobs/${id}`);
  }
  cancelJob(id: string) {
    return this.request<JobCancelResponse>("POST", `/v1/jobs/${id}/cancel`);
  }

  // Governance
  getRetention() {
    return this.request<RetentionPolicyResponse>(
      "GET",
      "/v1/governance/retention",
    );
  }
  setRetention(days: number | null) {
    return this.request<RetentionPolicyResponse>(
      "PUT",
      "/v1/governance/retention",
      { retention_days: days },
    );
  }
  applyRetention(dryRun = false) {
    return this.request<RetentionApplyResponse>(
      "POST",
      "/v1/governance/retention/apply",
      { dry_run: dryRun },
    );
  }
  classifyPattern(key: string, classification: string) {
    return this.request<ClassifyPatternResponse>(
      "PUT",
      `/v1/governance/patterns/${key}/classify`,
      { classification },
    );
  }
  deleteProject(projectId: string) {
    return this.request<ScopedDeleteResponse>(
      "DELETE",
      `/v1/governance/projects/${projectId}`,
    );
  }
  exportData(classification?: string) {
    const params = classification
      ? `?classification=${classification}`
      : "";
    // Returns NDJSON stream — handle differently
    return fetch(`${this.baseUrl}/v1/governance/export${params}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  // Billing
  getBillingStatus() {
    return this.request<BillingStatus>("GET", "/v1/billing/status");
  }
  createBillingPortal(returnUrl: string) {
    const q = new URLSearchParams({ return_url: returnUrl });
    return this.request<BillingPortalResponse>(
      "GET",
      `/v1/billing/portal?${q.toString()}`,
    );
  }
  createCheckoutSession(req: BillingCheckoutRequest) {
    return this.request<BillingCheckoutResponse>(
      "POST",
      "/v1/billing/checkout",
      req,
    );
  }

  // Account deletion (self-service GDPR Art. 17)
  requestAccountDeletion(body?: DeletionRequestBody) {
    return this.request<DeletionRequestResponse>(
      "POST",
      "/auth/me/deletion-request",
      body ?? {},
    );
  }

  // Credentials (BYOK, Phase 6.6)
  listCredentials() {
    return this.request<CredentialPublicView[]>("GET", "/v1/credentials");
  }
  getCredential(id: string) {
    return this.request<CredentialPublicView>("GET", `/v1/credentials/${id}`);
  }
  createCredential(req: CredentialCreateRequest) {
    return this.request<CredentialPublicView>("POST", "/v1/credentials", req);
  }
  updateCredential(id: string, req: CredentialUpdateRequest) {
    return this.request<CredentialPublicView>(
      "PATCH",
      `/v1/credentials/${id}`,
      req,
    );
  }
  revokeCredential(id: string) {
    return this.request<void>("DELETE", `/v1/credentials/${id}`);
  }
  validateCredential(id: string) {
    return this.request<CredentialPublicView>(
      "POST",
      `/v1/credentials/${id}/validate`,
    );
  }

  // Phase 6.6 #4 — Ollama pulled-model discovery. Backend returns 400 for
  // non-Ollama providers; UI must gate the call on provider === "ollama".
  listCredentialModels(id: string, forceRefresh = false) {
    const q = forceRefresh ? "?force_refresh=true" : "";
    return this.request<OllamaModelsResponse>(
      "GET",
      `/v1/credentials/${id}/models${q}`,
    );
  }

  // Phase 6.6 #2 — Business+ tier-gated sub-resources. Both require an
  // ``If-Match`` header derived from the credential's ``updated_at``.
  updateRoleModels(
    id: string,
    req: RoleModelsUpdateRequest,
    ifMatch: string,
  ) {
    return this.request<CredentialPublicView>(
      "PATCH",
      `/v1/credentials/${id}/role-models`,
      req,
      { "If-Match": ifMatch },
    );
  }
  updateFailoverChain(
    id: string,
    req: FailoverChainUpdateRequest,
    ifMatch: string,
  ) {
    return this.request<CredentialPublicView>(
      "PATCH",
      `/v1/credentials/${id}/failover-chain`,
      req,
      { "If-Match": ifMatch },
    );
  }
  updateRoleCostLimits(
    id: string,
    req: RoleCostLimitsUpdateRequest,
    ifMatch: string,
  ) {
    return this.request<CredentialPublicView>(
      "PATCH",
      `/v1/credentials/${id}/role-cost-limits`,
      req,
      { "If-Match": ifMatch },
    );
  }

  // Audit
  audit(
    limit = 50,
    opts: { since?: string; until?: string; action?: string; actor?: string } = {},
  ) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (opts.since) params.set("since", opts.since);
    if (opts.until) params.set("until", opts.until);
    if (opts.action) params.set("action", opts.action);
    if (opts.actor) params.set("actor", opts.actor);
    return this.request<AuditResponse>(
      "GET",
      `/v1/audit?${params.toString()}`,
    );
  }
}
