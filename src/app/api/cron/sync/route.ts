import { NextRequest, NextResponse } from "next/server";
import { syncAllActiveCredentials } from "@/lib/provider-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json(
      { error: "CRON_SECRET must be set to a 16+ character secret." },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (token !== secret) return unauthorized();

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(Math.max(Number(daysParam ?? 7) || 7, 1), 90);
  const startedAt = new Date();
  const results = await syncAllActiveCredentials(days);
  const finishedAt = new Date();

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    startedAt,
    finishedAt,
    days,
    total: {
      credentials: results.length,
      inserted: results.reduce((sum, r) => sum + r.inserted, 0),
      skipped: results.reduce((sum, r) => sum + r.skipped, 0),
      failed: results.filter((r) => !r.ok).length,
    },
    results,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST with Authorization: Bearer <CRON_SECRET>." },
    { status: 405 }
  );
}
