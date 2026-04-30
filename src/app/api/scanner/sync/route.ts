import { NextRequest, NextResponse } from "next/server"
import { isSyncing, runFullSync, runIncrementalSync } from "@/lib/scanner/sync"
import { getSyncStatus } from "@/lib/db/scanner-db"
import type { ScannerScope } from "@/types"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const { type = "full", scope = "ALL" } = await req.json().catch(() => ({ type: "full", scope: "ALL" }))
  const normalizedScope: ScannerScope = scope === "US" || scope === "KR" ? scope : "ALL"

  if (isSyncing()) {
    return NextResponse.json({ ok: false, message: "이미 동기화가 실행 중입니다." }, { status: 409 })
  }

  // 백그라운드 실행 (응답 즉시 반환)
  if (type === "incremental") {
    runIncrementalSync(normalizedScope).catch(console.error)
  } else {
    runFullSync(normalizedScope).catch(console.error)
  }

  return NextResponse.json({
    ok:      true,
    type,
    scope: normalizedScope,
    message: type === "incremental" ? "증분 업데이트 시작됨" : "전체 동기화 시작됨",
    status:  getSyncStatus(),
  })
}
