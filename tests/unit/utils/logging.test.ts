import { describe, it, expect } from "vitest";
import { redactForLogs, safeStringifyForLogs } from "../../../server/utils/logging.js";

describe("logging redaction helpers", () => {
  it("redacts token at the top level", () => {
    const input = { token: "abc", message: "ok" };
    const out = redactForLogs(input) as any;

    expect(out).toEqual({ token: "[REDACTED]", message: "ok" });
  });

  it("redacts token inside nested objects", () => {
    const input = { user: { token: "abc", email: "x@y" } };
    const out = redactForLogs(input) as any;

    expect(out.user.token).toBe("[REDACTED]");
    expect(out.user.email).toBe("x@y");
  });

  it("redacts accessToken inside arrays", () => {
    const input = { items: [{ accessToken: "t1" }] };
    const out = redactForLogs(input) as any;

    expect(out.items[0].accessToken).toBe("[REDACTED]");
  });

  it("safeStringifyForLogs does not throw for circular objects", () => {
    const a: any = {};
    a.self = a;

    const redacted = redactForLogs(a);
    const str = safeStringifyForLogs(redacted, 1000);

    expect(typeof str).toBe("string");
    expect(str).toContain("[CIRCULAR]");
  });
});

