import { describe, expect, it } from "vitest";
import { classifyContentType, classifyError, classifyHttpStatus, parseRetryAfter } from "./retry";

describe("classifyHttpStatus (Phase 5 plan cases)", () => {
  it("succeeds on 2xx", () => {
    expect(classifyHttpStatus(200).decision).toBe("success");
  });
  it("retries timeouts and 408 with backoff", () => {
    expect(classifyHttpStatus(408)).toMatchObject({ decision: "retry", status: 408 });
  });
  it("retries 429 and honours Retry-After", () => {
    const r = classifyHttpStatus(429, "120");
    expect(r.decision).toBe("retry");
    expect(r.retryAfterSecs).toBe(120);
  });
  it("retries 5xx within the attempt cap", () => {
    for (const s of [500, 502, 503, 504]) {
      expect(classifyHttpStatus(s).decision).toBe("retry");
    }
  });
  it("fails 404/410 permanently", () => {
    expect(classifyHttpStatus(404).decision).toBe("permanent");
    expect(classifyHttpStatus(410).decision).toBe("permanent");
  });
  it("parks 403/401 separately for fallback policy", () => {
    expect(classifyHttpStatus(403).decision).toBe("blocked");
    expect(classifyHttpStatus(401).decision).toBe("blocked");
  });
  it("fails other 4xx permanently", () => {
    expect(classifyHttpStatus(400).decision).toBe("permanent");
  });
});

describe("parseRetryAfter", () => {
  it("parses delta seconds and clamps absurd values", () => {
    expect(parseRetryAfter("30")).toBe(30);
    expect(parseRetryAfter("99999")).toBe(3600);
    expect(parseRetryAfter("junk")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe("classifyError (transport failures retry)", () => {
  it("retries timeouts", () => {
    const e = new Error("Request timed out");
    e.name = "TimeoutError";
    expect(classifyError(e).decision).toBe("retry");
    expect(classifyError(new Error("request timed out after 2 seconds")).reason).toMatch(
      /^network-error/
    );
  });
  it("retries DNS failures", () => {
    const e = Object.assign(new Error("getaddrinfo ENOTFOUND x.example"), {
      code: "ENOTFOUND",
    });
    expect(classifyError(e).decision).toBe("retry");
  });
  it("retries refused connections", () => {
    expect(classifyError(new Error("connect ECONNREFUSED"))).toMatchObject({
      decision: "retry",
      status: null,
    });
  });
  it("retries even unrecognised errors (bounded by the attempt cap)", () => {
    expect(classifyError(new Error("something deeply weird"))).toMatchObject({
      decision: "retry",
      status: null,
    });
  });
});

describe("classifyContentType", () => {
  const accepted = ["text/html", "application/xhtml+xml"];
  it("accepts article HTML", () => {
    expect(classifyContentType("text/html; charset=utf-8", accepted)).toBe("success");
  });
  it("rejects feeds, images, and binaries safely", () => {
    for (const ct of ["application/rss+xml", "image/png", "application/pdf", null]) {
      expect(classifyContentType(ct, accepted)).toBe("reject-content");
    }
  });
});
