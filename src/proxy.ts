import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-hq-path", pathname);
  const publicEnquiry = pathname === "/enquire" || pathname.startsWith("/enquire/");
  const invitation = pathname === "/accept-invite" || pathname.startsWith("/accept-invite/");
  if (publicEnquiry || invitation || pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/automation")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  const token = request.cookies.get("hq_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
