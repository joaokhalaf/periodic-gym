import { useState, useCallback, useRef, useEffect } from 'react'
import type { CameraStatus, VideoQualityPreset, VideoQuality } from '@/types/ai-coach'
import { VIDEO_QUALITY_PRESETS } from '@/types/ai-coach'

interface CameraCapabilities {
  maxWidth: number
  maxHeight: number
  supportedFrameRates: number[]
}

interface UseCameraProps {
  onCameraEnabled?: (stream: MediaStream) => void
  onCameraDisabled?: () => void
  onError?: (error: Error) => void
  videoQuality?: VideoQualityPreset
  preferredQuality?: VideoQuality
  facingMode?: 'user' | 'environment'
  enableAudio?: boolean
}

/**
 * Get device camera capabilities
 */
async function getCameraCapabilities(): Promise<CameraCapabilities | null> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter(d => d.kind === 'videoinput')

    if (videoDevices.length === 0) return null

    // Try to get capabilities from a test stream
    const testStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 4096 }, height: { ideal: 2160 } }
    })

    const track = testStream.getVideoTracks()[0]
    const capabilities = track.getCapabilities?.()

    testStream.getTracks().forEach(t => t.stop())

    if (capabilities) {
      return {
        maxWidth: capabilities.width?.max ?? 1920,
        maxHeight: capabilities.height?.max ?? 1080,
        supportedFrameRates: capabilities.frameRate
          ? [capabilities.frameRate.min ?? 15, capabilities.frameRate.max ?? 60]
          : [30]
      }
    }

    return { maxWidth: 1920, maxHeight: 1080, supportedFrameRates: [30] }
  } catch {
    return null
  }
}

/**
 * Select best quality preset based on device capabilities
 */
function selectBestQuality(
  capabilities: CameraCapabilities | null,
  preferred?: VideoQuality
): VideoQualityPreset {
  if (preferred && VIDEO_QUALITY_PRESETS[preferred]) {
    const preset = VIDEO_QUALITY_PRESETS[preferred]
    if (!capabilities) return preset

    // Ensure preset doesn't exceed device capabilities
    return {
      ...preset,
      width: Math.min(preset.width, capabilities.maxWidth),
      height: Math.min(preset.height, capabilities.maxHeight),
      frameRate: Math.min(preset.frameRate ?? 30, capabilities.supportedFrameRates[1] ?? 30)
    }
  }

  if (!capabilities) return VIDEO_QUALITY_PRESETS.medium

  // Auto-select based on capabilities
  if (capabilities.maxWidth >= 1920 && capabilities.maxHeight >= 1080) {
    return VIDEO_QUALITY_PRESETS.high
  } else if (capabilities.maxWidth >= 1280 && capabilities.maxHeight >= 720) {
    return VIDEO_QUALITY_PRESETS.medium
  }
  return VIDEO_QUALITY_PRESETS.low
}

export function useCamera({
  onCameraEnabled,
  onCameraDisabled,
  onError,
  videoQuality,
  preferredQuality = 'medium',
  facingMode = 'user',
  enableAudio = true
}: UseCameraProps = {}) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>("off")
  const [userDetected, setUserDetected] = useState(false)
  const [activeQuality, setActiveQuality] = useState<VideoQualityPreset | null>(null)
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Get camera capabilities on mount
  useEffect(() => {
    getCameraCapabilities().then(setCapabilities)
  }, [])

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
      // Use provided quality or auto-select
      const quality = videoQuality ?? selectBestQuality(capabilities, preferredQuality)
      setActiveQuality(quality)

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: quality.width, max: quality.width },
          height: { ideal: quality.height, max: quality.height },
          frameRate: { ideal: quality.frameRate ?? 30 },
          facingMode
        },
        audio: enableAudio
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)

      // Log actual resolution obtained
      const videoTrack = mediaStream.getVideoTracks()[0]
      const settings = videoTrack.getSettings()
      console.log(`[Camera] Active resolution: ${settings.width}x${settings.height}@${settings.frameRate}fps`)

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
  }, [videoQuality, capabilities, preferredQuality, facingMode, enableAudio, onCameraEnabled, onError])

  const disableCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
    setStatus("off")
    setUserDetected(false)
    setActiveQuality(null)
    onCameraDisabled?.()
  }, [stream, onCameraDisabled])

  /**
   * Switch camera quality while streaming
   */
  const switchQuality = useCallback(async (newQuality: VideoQuality): Promise<boolean> => {
    if (!stream) return false

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return false

    const quality = VIDEO_QUALITY_PRESETS[newQuality]

    try {
      await videoTrack.applyConstraints({
        width: { ideal: quality.width },
        height: { ideal: quality.height },
        frameRate: { ideal: quality.frameRate ?? 30 }
      })
      setActiveQuality(quality)
      return true
    } catch (err) {
      console.warn('[Camera] Failed to switch quality:', err)
      return false
    }
  }, [stream])

  return {
    stream,
    status,
    userDetected,
    videoRef,
    activeQuality,
    capabilities,
    enableCamera,
    disableCamera,
    switchQuality
  }
}
