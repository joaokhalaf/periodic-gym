"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Video,
  VideoOff,
  Play,
  Square,
  Upload,
  User,
  UserCheck,
  Camera,
  AlertCircle,
  RotateCcw,
  Settings,
  Download,
  Timer,
  Activity,
  Loader2
} from "lucide-react"
import { useState, useRef, useCallback, useEffect } from "react"
import { useCamera } from "@/hooks/useCamera"
import { useRecording } from "@/hooks/useRecording"
import { usePoseAnalysis } from "@/hooks/usePoseAnalysis"
import { StatusCard } from "@/components/ai-coach/status-card"
import { FeedbackList } from "@/components/ai-coach/feedback-list"
import { CameraView } from "@/components/ai-coach/camera-view"
import { downloadVideo, generateSessionId, extractFramesFromVideo } from "@/lib/video-utils"
import { saveSession } from "@/lib/db"
import { toast } from "sonner"

export interface VideoAnalysisResult {
  summary: string;
  repCount: number;
  formIssues: string[];
  strengths: string[];
  recommendations: string[];
  overallScore: number;
}

// Exercise positioning instructions
const exerciseInstructions: Record<string, string> = {
  "Remada Curvada": "Posicione-se de lado para a câmera",
  "Agachamento": "Posicione-se de frente ou de costas para a câmera",
  "Flexão": "Posicione-se de lado para a câmera",
}

export default function CoachPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [selectedExercise, setSelectedExercise] = useState("")
  const [feedback, setFeedback] = useState<string[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [geminiAnalysis, setGeminiAnalysis] = useState<VideoAnalysisResult | null>(null)
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const exercises = [
    "Remada Curvada",
    "Agachamento",
    "Flexão",
  ]

  const {
    stream,
    status: cameraStatus,
    userDetected,
    videoRef,
    enableCamera,
    disableCamera
  } = useCamera({
    onCameraEnabled: () => {
      setCameraPermissionDenied(false)
      const instruction = selectedExercise
        ? exerciseInstructions[selectedExercise] || "Posicione-se para a câmera"
        : "Selecione um exercício e posicione-se para análise"
      setFeedback(prev => [`✅ Câmera ativada! ${instruction}`, ...prev.slice(0, 2)])
      toast.success("Câmera ativada com sucesso!")
    },
    onError: (error) => {
      if (error.name === 'NotAllowedError' || error.message.includes('Permission denied')) {
        setCameraPermissionDenied(true)
        toast.error("Permissão da câmera necessária", {
          description: "Para analisar seus movimentos, precisamos acessar sua câmera. Habilite nas configurações do navegador.",
          duration: 10000,
        })
      } else {
        toast.error("Erro ao acessar câmera", {
          description: "Verifique se sua câmera está conectada e tente novamente.",
        })
      }
      setFeedback(prev => ["❌ Não foi possível acessar a câmera", ...prev.slice(0, 2)])
    }
  })

  const {
    isRecording,
    recordedChunks,
    previewUrl,
    startRecording,
    stopRecording,
    clearRecording
  } = useRecording({
    stream,
    onRecordingComplete: () => {
      setFeedback(prev => ["✅ Sessão finalizada! Veja os resultados.", ...prev.slice(0, 2)])
    }
  })

  const {
    aiFeedback,
    repCount,
    lastRepDuration,
    avgQuality,
    isModelLoaded
  } = usePoseAnalysis(videoRef, canvasRef, isSessionActive, selectedExercise)

  useEffect(() => {
    if (aiFeedback.length > 0) {
      setFeedback(aiFeedback)
    }
  }, [aiFeedback])

  // Update instructions when exercise changes
  useEffect(() => {
    if (selectedExercise && cameraStatus === "on") {
      const instruction = exerciseInstructions[selectedExercise]
      if (instruction) {
        toast.info("Dica de posicionamento", {
          description: instruction,
          duration: 5000,
        })
      }
    }
  }, [selectedExercise, cameraStatus])

  const handleStartSession = useCallback(async () => {
    if (!selectedExercise) {
      toast.warning("Selecione um exercício antes de iniciar")
      setFeedback(prev => ["⚠️ Selecione um exercício antes de iniciar.", ...prev.slice(0, 2)])
      return
    }

    if (cameraStatus !== "on") {
      toast.error("Ative a câmera para iniciar", {
        description: "Precisamos da câmera para analisar seus movimentos em tempo real.",
      })
      return
    }

    if (!isModelLoaded) {
      toast.info("Aguarde...", {
        description: "Nossa IA está sendo carregada. Isso pode levar alguns segundos.",
      })
      setFeedback(prev => ["⏳ Aguardando IA carregar... (Pode levar alguns segundos)", ...prev.slice(0, 2)])
      return
    }

    if (!isSessionActive) {
      setIsSessionActive(true)
      await startRecording()
      const instruction = exerciseInstructions[selectedExercise] || "Posicione-se para a câmera"
      setFeedback(prev => [`🚀 Análise iniciada! ${instruction}`, ...prev.slice(0, 2)])
      toast.success("Análise iniciada!")
    } else {
      stopRecording()
      setIsSessionActive(false)
    }
  }, [selectedExercise, isSessionActive, startRecording, stopRecording, isModelLoaded, cameraStatus])

  const analyzeWithBackend = async (blob: Blob): Promise<VideoAnalysisResult> => {
    const formData = new FormData()
    formData.append('exercise', selectedExercise)
    if (repCount > 0) formData.append('detectedReps', repCount.toString())
    if (avgQuality > 0) formData.append('avgQuality', avgQuality.toString())

    // Extrair frames do vídeo para reduzir tamanho (evita erro 413)
    try {
      const frames = await extractFramesFromVideo(blob, 6)
      formData.append('frames', JSON.stringify(frames))
    } catch (err) {
      console.warn('Falha ao extrair frames, enviando vídeo completo:', err)
      formData.append('video', blob)
    }

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController()

    const response = await fetch('/api/v1/analyze', {
      method: 'POST',
      body: formData,
      signal: abortControllerRef.current.signal,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Falha na análise')
    }

    return response.json()
  }

  const uploadToBackend = async () => {
    if (!previewUrl && recordedChunks.length === 0) {
      toast.warning("Nenhum vídeo disponível para enviar")
      setFeedback(prev => ["⚠️ Nenhum vídeo disponível para enviar.", ...prev.slice(0, 2)])
      return
    }

    setIsAnalyzing(true)
    setUploadProgress(10)
    setFeedback(prev => ["🤖 Analisando seu movimento com IA...", ...prev.slice(0, 2)])

    try {
      let blob: Blob
      if (recordedChunks.length > 0) {
        blob = new Blob(recordedChunks, { type: "video/webm" })
      } else {
        const res = await fetch(previewUrl!)
        blob = await res.blob()
      }

      setUploadProgress(30)
      setFeedback(prev => ["🔍 Processando movimento e postura...", ...prev.slice(0, 2)])

      // Analyze with backend API
      const analysis = await analyzeWithBackend(blob)

      setUploadProgress(80)
      setGeminiAnalysis(analysis)

      // Build detailed feedback
      const detailedFeedback: string[] = [
        `✅ ${analysis.summary}`,
        `🎯 Nota: ${analysis.overallScore}/100`,
        `🔄 Repetições válidas: ${analysis.repCount}`,
        "",
        "💪 Pontos Fortes:",
        ...analysis.strengths.map(s => `  • ${s}`),
      ]

      if (analysis.formIssues.length > 0) {
        detailedFeedback.push(
          "",
          "⚠️ Pontos de Melhoria:",
          ...analysis.formIssues.map(i => `  • ${i}`)
        )
      }

      detailedFeedback.push(
        "",
        "📋 Recomendações:",
        ...analysis.recommendations.map(r => `  • ${r}`)
      )

      setFeedback(detailedFeedback)
      setUploadProgress(100)
      toast.success("Análise concluída!", {
        description: `Nota: ${analysis.overallScore}/100`,
      })

      // Save session
      await saveSession({
        id: generateSessionId(),
        exercise: selectedExercise,
        date: new Date(),
        reps: analysis.repCount,
        duration: 0,
        videoBlob: blob,
        analysis: {
          reps: analysis.repCount,
          summary: analysis.summary,
          suggestions: analysis.recommendations,
          quality: analysis.overallScore >= 80 ? 'excellent' : analysis.overallScore >= 60 ? 'good' : analysis.overallScore >= 40 ? 'fair' : 'poor',
          repCount: analysis.repCount,
          formIssues: analysis.formIssues,
          strengths: analysis.strengths,
          recommendations: analysis.recommendations,
          overallScore: analysis.overallScore
        }
      })

      setTimeout(() => {
        setFeedback(prev => ["💾 Análise salva com sucesso!", ...prev])
      }, 500)

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.info("Análise cancelada")
        setFeedback(prev => ["ℹ️ Análise cancelada.", ...prev.slice(0, 2)])
        return
      }

      console.error("Erro na análise:", err)
      toast.error("Erro na análise", {
        description: "Não foi possível analisar o vídeo. Tente novamente.",
      })
      setFeedback(prev => [
        "❌ Erro ao analisar o vídeo.",
        "💡 Tente gravar novamente ou contate o suporte.",
        ...prev.slice(0, 2)
      ])
    } finally {
      setIsAnalyzing(false)
      abortControllerRef.current = null
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }

  const handleDownloadVideo = () => {
    if (previewUrl) {
      setIsSaving(true)
      try {
        downloadVideo(previewUrl, `${selectedExercise}-${Date.now()}.webm`)
        toast.success("Download iniciado!")
        setFeedback(prev => ["💾 Download iniciado!", ...prev.slice(0, 2)])
      } catch (err) {
        toast.error("Erro ao salvar vídeo")
      } finally {
        setIsSaving(false)
      }
    }
  }

  const resetSession = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    setFeedback([])
    setGeminiAnalysis(null)
    setIsAnalyzing(false)
    setUploadProgress(0)
    clearRecording()
    toast.info("Sessão resetada")
    setFeedback(prev => ["🔄 Sessão resetada. Pronto para nova gravação!", ...prev.slice(0, 2)])
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFeedback(prev => ["📁 Vídeo carregado! Pronto para análise.", ...prev.slice(0, 2)])
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Camera permission modal */}
      {cameraPermissionDenied && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <Card className="max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-500">
                <AlertCircle className="w-6 h-6" />
                Permissão de Câmera Necessária
              </CardTitle>
              <CardDescription>
                Para analisar seus movimentos em tempo real, precisamos acessar sua câmera.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-2">
                <p><strong>Como habilitar:</strong></p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Clique no ícone de cadeado na barra de endereço</li>
                  <li>Encontre "Câmera" nas permissões</li>
                  <li>Altere para "Permitir"</li>
                  <li>Recarregue a página</li>
                </ol>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setCameraPermissionDenied(false)
                    enableCamera()
                  }}
                  className="flex-1"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Tentar Novamente
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="flex-1"
                >
                  Recarregar Página
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4 justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary"/>
              Coach Virtual AI
            </h1>
            <p className="text-xs text-muted-foreground">Análise Inteligente em Tempo Real</p>
          </div>
          <Badge variant={isSessionActive ? "destructive" : "outline"}>
            {isSessionActive ? "🔴 Gravando & Analisando" : "Inativo"}
          </Badge>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-6 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusCard
            icon={userDetected ? UserCheck : User}
            title="Posicionamento"
            value={userDetected ? "Corpo Detectado" : "Não detectado"}
            active={userDetected}
            variant={userDetected ? "success" : "warning"}
          />

          <StatusCard
            icon={RotateCcw}
            title="Repetições"
            value={repCount.toString()}
            active={repCount > 0}
            variant="info"
          />

          <StatusCard
            icon={Timer}
            title="Tempo de Subida"
            value={lastRepDuration > 0 ? `${lastRepDuration.toFixed(2)}s` : "--"}
            active={lastRepDuration > 0}
            variant={
              lastRepDuration > 3.0 ? "error" :
              lastRepDuration < 0.5 ? "warning" :
              "success"
            }
          />

          <StatusCard
            icon={Settings}
            title="Exercício"
            value={selectedExercise || "Não selecionado"}
            active={!!selectedExercise}
            variant={selectedExercise ? "warning" : "default"}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração</CardTitle>
                <CardDescription>Selecione o exercício para análise</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedExercise}
                  onValueChange={setSelectedExercise}
                  disabled={isSessionActive}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um exercício" />
                  </SelectTrigger>
                  <SelectContent>
                    {exercises.map((exercise) => (
                      <SelectItem key={exercise} value={exercise}>
                        {exercise}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedExercise && (
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 {exerciseInstructions[selectedExercise]}
                  </p>
                )}
              </CardContent>
            </Card>

            <CameraView
              videoRef={videoRef}
              canvasRef={canvasRef}
              cameraStatus={cameraStatus}
              isRecording={isRecording}
              userDetected={userDetected}
              selectedExercise={selectedExercise}
            />

            <div className="flex gap-3">
              {cameraStatus === "off" ? (
                <Button onClick={enableCamera} className="flex-1" size="lg">
                  <Camera className="mr-2 h-5 w-5" /> Ativar Câmera
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleStartSession}
                    size="lg"
                    className={`flex-1 ${isSessionActive ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`}
                    disabled={!isModelLoaded || cameraStatus !== "on"}
                  >
                    {!isModelLoaded ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Carregando IA...
                      </>
                    ) : isSessionActive ? (
                      <><Square className="mr-2 h-5 w-5"/> Parar Treino</>
                    ) : (
                      <><Play className="mr-2 h-5 w-5"/> Iniciar Análise</>
                    )}
                  </Button>
                  <Button
                    onClick={disableCamera}
                    variant="outline"
                    size="lg"
                    disabled={isSessionActive}
                  >
                    <VideoOff className="h-5 w-5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Card className="h-full border-primary/10 shadow-md">
              <CardHeader>
                <CardTitle className="text-md">Feedback em Tempo Real</CardTitle>
                <CardDescription>Análise inteligente da sua postura e movimento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FeedbackList feedback={feedback} isSessionActive={isSessionActive} />

                {!isSessionActive && previewUrl && (
                  <div className="pt-4 border-t space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Ações da Sessão</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={uploadToBackend}
                        disabled={isAnalyzing || isSaving}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Analisando...
                          </>
                        ) : (
                          "Analisar"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadVideo}
                        disabled={isAnalyzing || isSaving}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2"/> Salvar
                          </>
                        )}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetSession}
                      className="w-full"
                      disabled={isSaving}
                    >
                      {isAnalyzing ? "Cancelar e Descartar" : "Descartar"}
                    </Button>
                  </div>
                )}

                {isAnalyzing && uploadProgress > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Analisando...</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  Como usar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  "Selecione o exercício desejado",
                  "Ative a câmera e siga a instrução de posicionamento",
                  "Clique em 'Iniciar Análise'",
                  "Receba feedback em tempo real",
                  "Envie para análise completa com IA"
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-xs">{step}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}