// Edge 런타임 호환 인증 설정 — Prisma/DB import 없음
// middleware.ts에서 이 파일만 참조해야 번들 크기가 1MB 이하로 유지됩니다.
import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import Naver from "next-auth/providers/naver"

export const authConfig = {
  providers: [Google, Naver],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    // JWT 전략: session 콜백에서 user 대신 token 사용
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
} satisfies NextAuthConfig
