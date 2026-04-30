import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Naver from "next-auth/providers/naver"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google, Naver],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "database",
  },
  callbacks: {
    signIn({ user }) {
      const allowed = process.env.ALLOWED_EMAILS
      if (!allowed) return false
      return allowed
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .includes((user.email ?? "").toLowerCase())
    },
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
})
