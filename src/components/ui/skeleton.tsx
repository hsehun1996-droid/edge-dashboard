import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton", className)}
      {...props}
    />
  )
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("card p-6", className)}>
      <Skeleton className="h-4 w-24 mb-4" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-4 w-20" />
    </div>
  )
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex gap-4 px-4 py-3 border-b border-surface-border/50">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" style={{ maxWidth: `${80 + i * 20}px` }} />
      ))}
    </div>
  )
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("card p-6", className)}>
      <Skeleton className="h-4 w-32 mb-2" />
      <Skeleton className="h-4 w-24 mb-6" />
      <Skeleton className="w-full h-48 rounded-lg" />
    </div>
  )
}
