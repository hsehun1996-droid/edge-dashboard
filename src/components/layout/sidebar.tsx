"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signIn, signOut } from "next-auth/react"
import {
  Globe,
  BarChart3,
  Wallet,
  Radar,
  TrendingUp,
  ChevronRight,
  LogIn,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  {
    label: "Global Market Pulse",
    sublabel: "글로벌 시장",
    href: "/",
    icon: Globe,
  },
  {
    label: "Trade Data Insights",
    sublabel: "수출입 데이터",
    href: "/trade",
    icon: BarChart3,
  },
  {
    label: "Private Vault",
    sublabel: "포트폴리오",
    href: "/vault",
    icon: Wallet,
  },
  {
    label: "Alpha Scanner",
    sublabel: "종목 탐색",
    href: "/scanner",
    icon: Radar,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <aside
      className="fixed top-0 left-0 h-full z-30 flex flex-col"
      style={{
        width: "var(--sidebar-width)",
        backgroundColor: "var(--color-bg-secondary)",
        borderRight: "1px solid var(--color-surface-border)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-surface-border shrink-0">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
          <TrendingUp size={14} className="text-white" strokeWidth={2.5} />
        </div>
        <div>
          <span className="text-[17px] font-bold text-text-primary tracking-tight">EDGE</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto scrollbar-thin">
        <p className="px-2 mb-2 text-[11px] font-medium text-text-tertiary uppercase tracking-widest">
          Navigation
        </p>
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-[150ms] group",
                    isActive
                      ? "bg-accent-light text-accent"
                      : "text-text-secondary hover:bg-bg-primary hover:text-text-primary"
                  )}
                >
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2 : 1.5}
                    className={cn(
                      "shrink-0 transition-colors",
                      isActive ? "text-accent" : "text-text-tertiary group-hover:text-text-secondary"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[13px] font-medium truncate", isActive && "text-accent")}>
                      {item.label}
                    </p>
                    <p className="text-[11px] text-text-tertiary truncate">{item.sublabel}</p>
                  </div>
                  {isActive && <ChevronRight size={14} className="text-accent shrink-0" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User / Auth */}
      <div className="px-3 py-3 border-t border-surface-border shrink-0">
        {session?.user ? (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name ?? ""}
                className="w-7 h-7 rounded-full shrink-0 object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-accent-light flex items-center justify-center shrink-0">
                <span className="text-[11px] font-semibold text-accent">
                  {(session.user.name ?? "U")[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-text-primary truncate">
                {session.user.name}
              </p>
              <p className="text-[10px] text-text-tertiary truncate">
                {session.user.email}
              </p>
            </div>
            <button
              onClick={() => signOut()}
              title="로그아웃"
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-primary transition-colors cursor-pointer"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn()}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl border border-surface-border text-text-secondary hover:text-text-primary hover:bg-bg-primary transition-colors text-[13px] font-medium cursor-pointer"
          >
            <LogIn size={14} />
            로그인
          </button>
        )}
      </div>
    </aside>
  )
}
