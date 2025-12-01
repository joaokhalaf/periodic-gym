import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"

interface FeedbackListProps {
  feedback: string[]
  isSessionActive: boolean
}

export function FeedbackList({ feedback, isSessionActive }: FeedbackListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          Feedback em Tempo Real
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isSessionActive ? 'Aguardando movimento...' : 'Inicie uma sessão para receber feedback'}
            </p>
          ) : (
            feedback.map((item, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg text-sm ${
                  item.includes("✅") || item.includes("💪")
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : item.includes("⚠️")
                      ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                      : item.includes("❌")
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                {item}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
