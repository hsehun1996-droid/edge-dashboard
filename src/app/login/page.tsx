"use client"

import { signIn } from "next-auth/react"
import { TrendingUp } from "lucide-react"

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6"
        style={{
          backgroundColor: "var(--color-surface-1)",
          border: "1px solid var(--color-surface-border)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center">
            <TrendingUp size={22} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">EDGE</h1>
            <p className="text-[13px] text-text-secondary mt-0.5">
              글로벌 투자 인텔리전스 플랫폼
            </p>
          </div>
        </div>

        <div
          className="border-t"
          style={{ borderColor: "var(--color-surface-border)" }}
        />

        {/* Login Buttons */}
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-text-tertiary text-center uppercase tracking-widest font-medium">
            소셜 계정으로 로그인
          </p>

          {/* Google */}
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl border transition-all duration-150 hover:bg-bg-secondary active:scale-[0.98] cursor-pointer"
            style={{
              borderColor: "var(--color-surface-border)",
              backgroundColor: "var(--color-surface-1)",
              color: "var(--color-text-primary)",
            }}
          >
            <GoogleIcon />
            <span className="text-[14px] font-medium">Google로 로그인</span>
          </button>

          {/* Naver */}
          <button
            onClick={() => signIn("naver", { callbackUrl: "/" })}
            className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl transition-all duration-150 hover:opacity-90 active:scale-[0.98] cursor-pointer"
            style={{ backgroundColor: "#03C75A", color: "#ffffff" }}
          >
            <NaverIcon />
            <span className="text-[14px] font-medium">네이버로 로그인</span>
          </button>
        </div>

        <p className="text-[11px] text-text-tertiary text-center leading-relaxed">
          로그인 시 개인정보 처리방침 및 이용약관에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  )
}

function NaverIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"
        fill="#ffffff"
      />
    </svg>
  )
}
