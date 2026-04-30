import { cn } from "@/lib/utils"

type BadgeVariant = "positive" | "negative" | "neutral" | "warning" | "default"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantStyles: Record<BadgeVariant, string> = {
  positive: "bg-positive/15 text-positive",
  negative: "bg-negative/15 text-negative",
  neutral: "bg-neutral/15 text-neutral",
  warning: "bg-warning/15 text-warning",
  default: "bg-surface-border text-text-secondary",
}

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-medium",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
