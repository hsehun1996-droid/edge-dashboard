import { cn } from "@/lib/utils"
import React from "react"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, error, className, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full bg-bg-tertiary border border-surface-border rounded-[10px]",
            "px-4 py-3 text-[15px] text-text-primary placeholder:text-text-tertiary",
            "transition-all duration-[150ms]",
            "focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(0,193,112,0.15)]",
            error && "border-negative focus:border-negative focus:shadow-[0_0_0_3px_rgba(255,59,48,0.15)]",
            icon && "pl-10",
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-[13px] text-negative">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"
