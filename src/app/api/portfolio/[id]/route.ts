import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { quantity, avgCost, notes } = body

  const existing = await prisma.portfolio.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: "항목을 찾을 수 없어요." }, { status: 404 })
  }

  const newQty = quantity != null ? parseFloat(quantity) : existing.quantity
  const newCost = avgCost != null ? parseFloat(avgCost) : existing.avgCost

  const item = await prisma.portfolio.update({
    where: { id },
    data: {
      quantity: newQty,
      avgCost: newCost,
      totalInvested: newQty * newCost,
      ...(notes !== undefined && { notes }),
    },
  })

  return NextResponse.json({ data: item })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }

  const { id } = await params

  const existing = await prisma.portfolio.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: "항목을 찾을 수 없어요." }, { status: 404 })
  }

  await prisma.portfolio.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
