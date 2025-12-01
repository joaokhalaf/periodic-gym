import { Card, CardContent } from "@/components/ui/card"
import { Camera, Activity } from "lucide-react"

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  cameraStatus: 'off' | 'on' | 'error'
  isRecording: boolean
  userDetected: boolean
  selectedExercise: string
  currentPhase?: string
  repCount?: number
  avgQuality?: number
  isModelLoaded?: boolean
}

export function CameraView({
  videoRef,
  canvasRef,
  cameraStatus,
  isRecording,
  userDetected,
  selectedExercise,
  isModelLoaded = false
}: CameraViewProps) {

  return (
    <Card>
      <CardContent className="p-0">
        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
          {cameraStatus === "on" ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none"
              />

              {/* Status Indicators - Top */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {/* User Detection */}
                {userDetected && (
                  <div className="bg-green-500 text-white px-3 py-1.5 rounded-full text-sm flex items-center gap-2 shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    <span className="font-medium">Usuário detectado</span>
                  </div>
                )}

                {/* Model Status */}
                {isModelLoaded && (
                  <div className="bg-blue-500 text-white px-3 py-1.5 rounded-full text-sm flex items-center gap-2 shadow-lg">
                    <Activity className="w-3 h-3" />
                    <span className="font-medium">IA Ativa</span>
                  </div>
                )}
              </div>

              {/* Recording Indicator - Top Right */}
              {isRecording && (
                <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1.5 rounded-full text-sm font-medium animate-pulse flex items-center gap-2 shadow-lg">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                  REC
                </div>
              )}

              {/* Exercise Info - Bottom Left */}
              {selectedExercise && (
                <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-lg">
                  <p className="text-sm font-medium">{selectedExercise}</p>
                </div>
              )}

              {!userDetected && isRecording && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="bg-white/90 text-gray-900 px-6 py-4 rounded-lg text-center shadow-xl">
                    <Activity className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                    <p className="font-semibold">Buscando corpo...</p>
                    <p className="text-sm text-gray-600 mt-1">Posicione-se na frente da câmera</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-center text-muted-foreground">
              <div>
                <Camera className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <p className="font-medium text-lg">Câmera desligada</p>
                <p className="text-sm mt-2">Ative a câmera para começar</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}