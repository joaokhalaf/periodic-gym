import { Card } from "@/components/ui/card"
import { LucideIcon } from "lucide-react"

interface StatusCardProps {
  icon: LucideIcon
  title: string
  value: string
  active?: boolean
  variant?: 'success' | 'error' | 'warning' | 'info' | 'default'
}

const colorMap = {
  success: "bg-green-100 text-green-600",
  error: "bg-red-100 text-red-600",
  warning: "bg-yellow-100 text-yellow-600",
  info: "bg-blue-100 text-blue-600",
  default: "bg-gray-100 text-gray-400"
}

export function StatusCard({
  icon: Icon,
  title,
  value,
  active = false,
  variant = 'default'
}: StatusCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${active ? colorMap[variant] : colorMap.default}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{value}</p>
        </div>
      </div>
    </Card>
  )
}
