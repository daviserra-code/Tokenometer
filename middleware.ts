import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const MODE_COOKIE = "tokenometer-mode";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/site";
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tokenometer-surface", "marketing");
    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  if (pathname === "/app") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/demo") {
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(MODE_COOKIE, "demo", {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: "tokenometer.cloud",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  }

  if (pathname === "/site") {
    return NextResponse.next({
      request: {
        headers: new Headers([
          ...request.headers.entries(),
          ["x-tokenometer-surface", "marketing"],
        ]),
      },
    });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tokenometer-surface", "app");

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
