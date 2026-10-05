import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("public enquiry route", () => {
  it("serves /enquire without a session", async () => {
    const response = await proxy(new NextRequest("http://localhost/enquire"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("serves an invitation link without a session", async () => {
    const response = await proxy(new NextRequest("http://localhost/accept-invite/example-token-value"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("serves a client proposal without a session", async () => {
    const response = await proxy(new NextRequest("http://localhost/proposal/example-token-value"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("keeps the internal quotation workspace behind sign-in", async () => {
    const response = await proxy(new NextRequest("http://localhost/quotations"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("keeps the internal enquiry list behind sign-in", async () => {
    const response = await proxy(new NextRequest("http://localhost/enquiries"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get("location")).toContain("/login");
  });
});
