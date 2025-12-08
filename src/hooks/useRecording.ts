import { useState, useRef, useCallback, useEffect } from 'react'
import type { VideoQualityPreset } from '@/types/ai-coach'

interface ExtendedMediaRecorder extends MediaRecorder {
  _progressInterval?: NodeJS.Timeout
}

interface UseRecordingProps {
  stream: MediaStream | null
  onRecordingComplete?: (blob: Blob) => void
  onRecordingStart?: () => void
  onRecordingStop?: () => void
  onError?: (error: Error) => void
  videoQuality?: VideoQualityPreset
}

export function useRecording({
  stream,
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
  onError,
  videoQuality = { width: 1280, height: 720, bitrate: 2500000 }
}: UseRecordingProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<ExtendedMediaRecorder | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      if (mediaRecorderRef.current?._progressInterval) {
        clearInterval(mediaRecorderRef.current._progressInterval)
      }
    }
  }, [previewUrl])

  const startRecording = useCallback(async (): Promise<void> => {
    if (!stream) {
      const error = new Error('Stream não disponível')
      onError?.(error)
      return
    }

    setRecordedChunks([])

    // Verificar codec suportado
    let mimeType = 'video/webm;codecs=vp9,opus'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus'
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }

    const options: MediaRecorderOptions = {
      mimeType,
      videoBitsPerSecond: videoQuality.bitrate
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options) as ExtendedMediaRecorder
      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data?.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        setRecordedChunks(chunks)
        const url = URL.createObjectURL(blob)
        setPreviewUrl(url)
        onRecordingComplete?.(blob)
        onRecordingStop?.()
      }

      mediaRecorder.onerror = (event: Event) => {
        console.error('MediaRecorder error:', event)
        const error = new Error('Erro durante a gravação')
        onError?.(error)
      }

      mediaRecorder.start(100) // Chunks pequenos para melhor streaming
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      onRecordingStart?.()
    } catch (err) {
      console.error("Erro ao iniciar MediaRecorder:", err)
      const error = err instanceof Error ? err : new Error('Erro ao iniciar gravação')
      onError?.(error)
    }
  }, [stream, videoQuality, onRecordingComplete, onRecordingStart, onRecordingStop, onError])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop()
      if (mediaRecorderRef.current?._progressInterval) {
        clearInterval(mediaRecorderRef.current._progressInterval)
      }
    }
    setIsRecording(false)
  }, [])

  const clearRecording = useCallback(() => {
    setRecordedChunks([])
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }, [previewUrl])

  return {
    isRecording,
    recordedChunks,
    previewUrl,
    mediaRecorderRef,
    startRecording,
    stopRecording,
    clearRecording
  }
}
