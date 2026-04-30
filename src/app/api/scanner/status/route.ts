import { NextResponse } from "next/server"
import { getSyncStatus } from "@/lib/db/scanner-db"
import { isSyncing }     from "@/lib/scanner/sync"

export const dynamic = "force-dynamic"

export async function GET() {
  const status = getSyncStatus()
  return NextResponse.json({ ...status, is_syncing: isSyncing() })
}
