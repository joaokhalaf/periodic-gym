import { useState, useCallback, useRef, useEffect } from 'react'
import type { CameraStatus, VideoQualityPreset } from '@/types/ai-coach'

interface UseCameraProps {
  onCameraEnabled?: (stream: MediaStream) => void
  onCameraDisabled?: () => void
  onError?: (error: Error) => void
  videoQuality?: VideoQualityPreset
}

export function useCamera({
  onCameraEnabled,
  onCameraDisabled,
  onError,
  videoQuality = { width: 1280, height: 720, bitrate: 2500000 }
}: UseCameraProps = {}) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>("off")
  const [userDetected, setUserDetected] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [stream])

  const enableCamera = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: videoQuality.width },
          height: { ideal: videoQuality.height },
          facingMode: 'user'
        },
        audio: true
      })

      setStream(mediaStream)
      setStatus("on")
      setUserDetected(true)
      onCameraEnabled?.(mediaStream)

      return mediaStream
    } catch (err) {
      console.error("Erro ao acessar câmera:", err)
      setStatus("error")
      const error = err instanceof Error ? err : new Error('Erro ao acessar câmera')
      onError?.(error)
      return null
    }
  }, [videoQuality, onCameraEnabled, onError])

  const disableCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
    setStatus("off")
    setUserDetected(false)
    onCameraDisabled?.()
  }, [stream, onCameraDisabled])

  return {
    stream,
    status,
    userDetected,
    videoRef,
    enableCamera,
    disableCamera
  }
}
