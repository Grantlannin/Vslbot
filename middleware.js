import { NextResponse } from "next/server";

/** Only /pipeline is gated. /intake and all other routes stay public. */

export function middleware(request) {
  const password = process.env.PIPELINE_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  const user = process.env.PIPELINE_BASIC_USER || "admin";

  let ok = false;
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const sep = decoded.indexOf(":");
      const u = sep >= 0 ? decoded.slice(0, sep) : "";
      const p = sep >= 0 ? decoded.slice(sep + 1) : "";
      ok = u === user && p === password;
    } catch {
      ok = false;
    }
  }

  if (!ok) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="VSL Pipeline"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/pipeline", "/pipeline/:path*"],
};
