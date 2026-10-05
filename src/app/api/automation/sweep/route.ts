import { NextResponse } from "next/server";
import { sweep } from "@/server/automation";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await sweep(true);
  return NextResponse.json({ ok: true });
}
