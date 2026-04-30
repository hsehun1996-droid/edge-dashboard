import { cn } from "@/lib/utils"
import React from "react"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type ButtonSize = "sm" | "md" | "lg"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-dark active:scale-[0.99] shadow-sm",
  secondary: "bg-bg-secondary text-text-primary border border-surface-border hover:bg-bg-tertiary",
  ghost: "bg-transparent text-accent hover:bg-accent-light",
  danger: "bg-negative/10 text-negative hover:bg-negative/20 border border-negative/20",
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[13px] font-medium rounded-lg",
  md: "px-5 py-2.5 text-[15px] font-semibold rounded-xl",
  lg: "px-7 py-3.5 text-[15px] font-semibold rounded-xl",
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 transition-all duration-[150ms] ease-default",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"
