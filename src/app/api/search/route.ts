import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { globalSearch } from "@/server/services/insights";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") || "";
  const results = await globalSearch(q);
  return NextResponse.json({ results });
}
