import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }

  const items = await prisma.portfolio.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ data: items })
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { ticker, name, exchange, currency, type = "BUY", quantity, avgCost, buyDate, notes } = body

    if (!ticker || !name || quantity == null || avgCost == null) {
      return NextResponse.json(
        { error: "ticker, name, quantity, avgCost는 필수값입니다." },
        { status: 400 }
      )
    }

    const tradeType = (type as string).toUpperCase() === "SELL" ? "SELL" : "BUY"
    const qty = Number(quantity)
    const price = Number(avgCost)

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        { error: "quantity와 avgCost는 0보다 큰 유효한 숫자여야 합니다." },
        { status: 400 }
      )
    }

    let computedRealizedGain: number | null = null
    if (tradeType === "SELL") {
      const existingLots = await prisma.portfolio.findMany({
        where: { userId, ticker: ticker.toUpperCase() },
        orderBy: [{ buyDate: "asc" }, { createdAt: "asc" }],
      })

      let runningQty = 0
      let runningCostBasis = 0

      for (const lot of existingLots) {
        if (lot.type === "BUY") {
          runningQty += lot.quantity
          runningCostBasis += lot.quantity * lot.avgCost
          continue
        }

        const avgCostPerShare = runningQty > 0 ? runningCostBasis / runningQty : 0
        runningCostBasis -= lot.quantity * avgCostPerShare
        runningQty -= lot.quantity
        if (runningQty < 0) runningQty = 0
      }

      const avgCostBasis = runningQty > 0 ? runningCostBasis / runningQty : 0
      computedRealizedGain = qty * (price - avgCostBasis)
    }

    const item = await prisma.portfolio.create({
      data: {
        userId,
        ticker: ticker.toUpperCase(),
        name,
        exchange: exchange ?? "NASDAQ",
        currency: currency ?? "USD",
        type: tradeType,
        quantity: qty,
        avgCost: price,
        totalInvested: qty * price,
        realizedGain: computedRealizedGain,
        buyDate: buyDate ? new Date(buyDate) : null,
        notes,
      },
    })

    return NextResponse.json({ data: item }, { status: 201 })
  } catch (error) {
    console.error("Failed to create portfolio item", error)

    return NextResponse.json(
      { error: "종목 추가 처리 중 서버 오류가 발생했습니다." },
      { status: 500 }
    )
  }
}
