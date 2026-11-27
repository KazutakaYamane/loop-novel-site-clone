import { describe, expect, test } from "vitest";
import { clientIp } from "./clientIp";

function headers(forwardedFor?: string): Headers {
  return new Headers(forwardedFor === undefined ? {} : { "X-Forwarded-For": forwardedFor });
}

describe("clientIp @AC-F2-7", () => {
  test("uses the address Next.js put in X-Forwarded-For from the connection", () => {
    expect(clientIp(headers("172.21.0.6"))).toBe("172.21.0.6");
  });

  test("uses the address the proxy in front appended, not the ones the browser sent before it", () => {
    expect(clientIp(headers("198.51.100.1, 10.0.0.2,203.0.113.7"))).toBe("203.0.113.7");
  });

  test("accepts IPv6 addresses", () => {
    expect(clientIp(headers("198.51.100.1, 2001:db8:0:0:1:2:3:4"))).toBe("2001:db8:0:0:1:2:3:4");
    expect(clientIp(headers("::ffff:172.21.0.6"))).toBe("::ffff:172.21.0.6");
  });

  test("returns nothing when there is no address", () => {
    expect(clientIp(headers())).toBeNull();
    expect(clientIp(headers(""))).toBeNull();
    expect(clientIp(headers("198.51.100.1, "))).toBeNull();
  });

  test("returns nothing when the last entry is not an IP address", () => {
    expect(clientIp(headers("198.51.100.1, unknown"))).toBeNull();
    expect(clientIp(headers("203.0.113.7 x"))).toBeNull();
    expect(clientIp(headers("999.1.1.1"))).toBeNull();
    expect(clientIp(headers("01.2.3.4"))).toBeNull();
    expect(clientIp(headers("2001:db8::zz"))).toBeNull();
  });
});
