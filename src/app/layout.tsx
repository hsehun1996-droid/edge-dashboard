import type { Metadata } from "next"
import "./globals.css"
import { Sidebar } from "@/components/layout/sidebar"
import { QueryProvider } from "@/components/providers/query-provider"
import { CurrencyProvider } from "@/components/providers/currency-provider"
import { AuthProvider } from "@/components/providers/session-provider"

export const metadata: Metadata = {
  title: {
    default: "EDGE — 글로벌 투자 인텔리전스",
    template: "%s | EDGE",
  },
  description: "국내외 시장 데이터, 수출입 분석, 포트폴리오 관리, 종목 스캐너를 하나의 플랫폼에서",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full">
        <AuthProvider>
        <QueryProvider>
          <CurrencyProvider>
            <div className="flex h-full">
              <Sidebar />
              <main
                className="flex-1 min-h-screen overflow-y-auto"
                style={{ marginLeft: "var(--sidebar-width)" }}
              >
                <div className="px-6 py-6">
                  {children}
                </div>
              </main>
            </div>
          </CurrencyProvider>
        </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
