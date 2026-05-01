import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    signIn({ user }) {
      const allowed = process.env.ALLOWED_EMAILS
      if (!allowed) return false
      return allowed
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .includes((user.email ?? "").toLowerCase())
    },
  },
})
