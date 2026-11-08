import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then asks the client to wait", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(limiter.take("a", 0)).toBe(0);
    expect(limiter.take("a", 1_000)).toBe(0);
    expect(limiter.take("a", 2_000)).toBe(58);
    expect(limiter.take("b", 2_000)).toBe(0);
  });

  it("frees capacity as the window slides", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
    expect(limiter.take("a", 0)).toBe(0);
    expect(limiter.take("a", 9_999)).toBeGreaterThan(0);
    expect(limiter.take("a", 10_000)).toBe(0);
  });
});

describe("clientKey", () => {
  it("uses the first forwarded address", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(clientKey(headers)).toBe("1.2.3.4");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
