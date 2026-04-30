import { describe, it, expect, vi } from "vitest";
import { detectRole } from "../auth-helpers";

const BACKEND = "http://core.test";

function makeFetchOk(body: unknown): typeof fetch {
  return vi.fn(async () => {
    return {
      ok: true,
      status: 200,
      async json() {
        return body;
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function makeFetchStatus(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body;
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function makeFetchThrow(err: unknown): typeof fetch {
  return vi.fn(async () => {
    throw err;
  }) as unknown as typeof fetch;
}

function makeFetchBadJson(): typeof fetch {
  return vi.fn(async () => {
    return {
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("detectRole — happy path", () => {
  it("returns the role from /auth/me response", async () => {
    const fetchImpl = makeFetchOk({ role: "editor" });
    const role = await detectRole("token-abc", { backendUrl: BACKEND, fetchImpl });
    expect(role).toBe("editor");
  });

  it("calls Core /auth/me with the access token in the Authorization header", async () => {
    const fetchImpl = makeFetchOk({ role: "owner" });
    await detectRole("the-token", { backendUrl: BACKEND, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${BACKEND}/auth/me`);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer the-token",
    });
    // cache: "no-store" is required so a stale CDN/SW response can't pin the role.
    expect((init as RequestInit).cache).toBe("no-store");
  });

  it("returns each role string verbatim", async () => {
    for (const role of ["reader", "editor", "admin", "owner", "custom"]) {
      const role2 = await detectRole("t", {
        backendUrl: BACKEND,
        fetchImpl: makeFetchOk({ role }),
      });
      expect(role2).toBe(role);
    }
  });
});

// SECURITY-CRITICAL: every failure mode must fall back to the *most
// restrictive* role. Previously the default was "admin" — a Core 5xx hiccup
// silently elevated readers to the admin sidebar. This test suite locks the
// fallback to "reader" so a future regression fails loudly.
describe("detectRole — all failure modes fall back to `reader`", () => {
  it("network error → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchThrow(new TypeError("fetch failed")),
    });
    expect(role).toBe("reader");
  });

  it("non-2xx response (401) → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchStatus(401, { detail: "unauthorized" }),
    });
    expect(role).toBe("reader");
  });

  it("non-2xx response (500) → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchStatus(500, { detail: "internal" }),
    });
    expect(role).toBe("reader");
  });

  it("non-2xx response (503) → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchStatus(503),
    });
    expect(role).toBe("reader");
  });

  it("malformed JSON body → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchBadJson(),
    });
    expect(role).toBe("reader");
  });

  it("missing `role` field → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchOk({ user_id: "u-1", email: "a@b.cz" }),
    });
    expect(role).toBe("reader");
  });

  it("`role` is not a string (number) → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchOk({ role: 42 }),
    });
    expect(role).toBe("reader");
  });

  it("`role` is null → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchOk({ role: null }),
    });
    expect(role).toBe("reader");
  });

  it("body is null → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchOk(null),
    });
    expect(role).toBe("reader");
  });

  it("body is an array (no `role` field) → reader", async () => {
    const role = await detectRole("t", {
      backendUrl: BACKEND,
      fetchImpl: makeFetchOk(["editor"]),
    });
    expect(role).toBe("reader");
  });
});
