import { NextResponse } from "next/server"
import { getTradeSuggestions } from "@/lib/trade-search"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") ?? ""

  return NextResponse.json({
    data: getTradeSuggestions(query),
    timestamp: new Date().toISOString(),
  })
}
