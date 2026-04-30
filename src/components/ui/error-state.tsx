import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "./button"

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  compact?: boolean
}

export function ErrorState({
  title = "데이터를 불러올 수 없어요",
  message = "잠시 후 다시 시도해주세요.",
  onRetry,
  compact = false,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-text-secondary text-[13px] p-3">
        <AlertCircle size={14} className="text-negative shrink-0" />
        <span>{message}</span>
        {onRetry && (
          <button onClick={onRetry} className="text-accent hover:underline ml-1">
            재시도
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="w-10 h-10 rounded-full bg-negative/10 flex items-center justify-center">
        <AlertCircle size={20} className="text-negative" />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        <p className="text-[13px] text-text-secondary mt-1">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw size={14} />
          다시 시도
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  title = "데이터가 없어요",
  message,
  icon,
}: {
  title?: string
  message?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && (
        <div className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center text-text-tertiary">
          {icon}
        </div>
      )}
      <div>
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        {message && <p className="text-[13px] text-text-secondary mt-1">{message}</p>}
      </div>
    </div>
  )
}
