import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const MODE_COOKIE = "tokenometer-mode";
const DEFAULT_MARKETING_HOST = "tokenometer.cloud";
const DEFAULT_APP_URL = "https://www.tokenometer.cloud";
const DEFAULT_DEMO_URL = "https://www.tokenometer.cloud";

function normalizeHost(host: string | null) {
  return (host ?? "").toLowerCase().split(":")[0];
}

function getOriginHost(url: string, fallbackHost: string) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return fallbackHost;
  }
}

export function middleware(request: NextRequest) {
  const host = normalizeHost(request.headers.get("host"));
  const pathname = request.nextUrl.pathname;
  const marketingHost = process.env.NEXT_PUBLIC_MARKETING_HOST ?? DEFAULT_MARKETING_HOST;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
  const demoUrl = process.env.NEXT_PUBLIC_DEMO_URL ?? DEFAULT_DEMO_URL;
  const appHost = getOriginHost(appUrl, "www.tokenometer.cloud");
  const demoHost = getOriginHost(demoUrl, appHost);
  const isLocalHost =
    host === "localhost" || host === "127.0.0.1" || host === "" || host === "46.224.91.14";

  if (host === marketingHost) {
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
      return NextResponse.redirect(new URL("/", appUrl));
    }

    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/login", appUrl));
    }

    if (pathname === "/demo") {
      const response = NextResponse.redirect(new URL("/", demoUrl));
      response.cookies.set(MODE_COOKIE, "demo", {
        httpOnly: false,
        sameSite: "lax",
        secure: true,
        domain: marketingHost,
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
      return response;
    }

    if (!pathname.startsWith("/site")) {
      const url = new URL(pathname + request.nextUrl.search, appUrl);
      return NextResponse.redirect(url);
    }
  }

  if (host === appHost || host === demoHost || isLocalHost) {
    if (pathname === "/site") {
      return NextResponse.redirect(new URL("/", `https://${marketingHost}`));
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tokenometer-surface", pathname.startsWith("/site") ? "marketing" : "app");

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
