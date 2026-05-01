import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"
import { NextResponse } from "next/server"

// Node.js 런타임에서 실행 (proxy.ts) — 크기 제한 없음
const { auth } = NextAuth(authConfig)

const INVITE_COOKIE = "edge_invite"

export default auth(function proxy(req) {
  const { pathname } = req.nextUrl

  // NextAuth 콜백 + 로그인 페이지는 항상 허용
  if (pathname.startsWith("/api/auth") || pathname === "/login") {
    return NextResponse.next()
  }

  const validToken = process.env.INVITE_TOKEN

  // URL에 ?invite=TOKEN → 쿠키 발급 후 깔끔한 URL로 리다이렉트
  const inviteParam = req.nextUrl.searchParams.get("invite")
  if (inviteParam && validToken && inviteParam === validToken) {
    const url = req.nextUrl.clone()
    url.searchParams.delete("invite")
    const res = NextResponse.redirect(url)
    res.cookies.set(INVITE_COOKIE, validToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30일
      path: "/",
    })
    return res
  }

  // OAuth 로그인된 사용자 → 전체 접근 허용
  if (req.auth) return NextResponse.next()

  // 초대 쿠키 있는 게스트 → 공개 페이지 허용
  const inviteCookie = req.cookies.get(INVITE_COOKIE)
  if (validToken && inviteCookie?.value === validToken) return NextResponse.next()

  // 둘 다 없으면 로그인 페이지로
  return NextResponse.redirect(new URL("/login", req.url))
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|ico)$).*)"],
}
