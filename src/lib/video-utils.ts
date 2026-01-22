import type { AnalysisResult, FrameExtractionOptions, VideoQuality } from '@/types/ai-coach'

/**
 * Frame extraction quality presets based on video duration and target size
 */
export const FRAME_EXTRACTION_PRESETS: Record<VideoQuality, FrameExtractionOptions> = {
  low: { maxWidth: 480, maxHeight: 360, quality: 0.5, frameCount: 4 },
  medium: { maxWidth: 640, maxHeight: 480, quality: 0.7, frameCount: 6 },
  high: { maxWidth: 854, maxHeight: 480, quality: 0.85, frameCount: 8 }
}

/**
 * Calculate optimal frame extraction settings based on video duration
 */
export function getOptimalFrameSettings(durationSeconds: number): FrameExtractionOptions {
  if (durationSeconds <= 5) {
    return { ...FRAME_EXTRACTION_PRESETS.low, frameCount: 3 }
  } else if (durationSeconds <= 15) {
    return FRAME_EXTRACTION_PRESETS.medium
  } else if (durationSeconds <= 30) {
    return { ...FRAME_EXTRACTION_PRESETS.medium, frameCount: 8 }
  } else {
    return { ...FRAME_EXTRACTION_PRESETS.high, frameCount: 10 }
  }
}

/**
 * Estimate blob size in MB
 */
export function estimateBlobSizeMB(blob: Blob): number {
  return blob.size / (1024 * 1024)
}

export class UploadQueue {
  private queue: Array<{ blob: Blob; metadata: any }> = []
  private processing = false
  private listeners: Array<(progress: number) => void> = []

  async add(blob: Blob, metadata: any): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        blob,
        metadata: { ...metadata, resolve, reject }
      })
      if (!this.processing) {
        this.process()
      }
    })
  }

  onProgress(callback: (progress: number) => void) {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  private notifyProgress(progress: number) {
    this.listeners.forEach(listener => listener(progress))
  }

  private async process() {
    this.processing = true
    while (this.queue.length > 0) {
      const item = this.queue.shift()
      if (item) {
        try {
          const result = await this.upload(item.blob, item.metadata)
          item.metadata.resolve(result)
        } catch (error) {
          item.metadata.reject(error)
        }
      }
    }
    this.processing = false
  }

  private async upload(blob: Blob, metadata: any): Promise<AnalysisResult> {
    const fd = new FormData()
    fd.append("file", blob, `${metadata.exercise}-session.webm`)
    fd.append("exercise", metadata.exercise)
    fd.append("reps", metadata.reps?.toString() || '0')

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          this.notifyProgress(percentComplete)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText)
            resolve(result)
          } catch (err) {
            reject(new Error('Erro ao processar resposta'))
          }
        } else {
          reject(new Error(`Erro HTTP: ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Erro de rede'))
      })

      xhr.open('POST', '/api/analyze')
      xhr.send(fd)
    })
  }
}

export const uploadQueue = new UploadQueue()

export async function compressVideo(blob: Blob, quality: number = 0.7): Promise<Blob> {
  // Por enquanto retorna o blob original
  // Pode ser expandido com compressão real usando canvas/ffmpeg.wasm
  return blob
}

export function handleRecordingError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('permission') || error.message.includes('NotAllowedError')) {
      return '❌ Não foi possível acessar a câmera. Verifique as permissões.'
    }
    if (error.message.includes('NotFoundError')) {
      return '❌ Nenhuma câmera encontrada no dispositivo.'
    }
    if (error.message.includes('gravação')) {
      return '❌ Falha na gravação. Tente novamente.'
    }
    if (error.message.includes('upload') || error.message.includes('rede')) {
      return '❌ Falha no upload. Verifique sua conexão.'
    }
  }
  return '❌ Erro desconhecido. Tente novamente.'
}

export function downloadVideo(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Extrai frames de um vídeo para análise
 * @param videoBlob - Blob do vídeo
 * @param frameCountOrOptions - Número de frames ou objeto de opções
 * @returns Array de strings base64 das imagens
 */
export async function extractFramesFromVideo(
  videoBlob: Blob,
  frameCountOrOptions: number | Partial<FrameExtractionOptions> = 5
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Canvas context não disponível'))
      return
    }

    // Parse options
    const options: FrameExtractionOptions = typeof frameCountOrOptions === 'number'
      ? { ...FRAME_EXTRACTION_PRESETS.medium, frameCount: frameCountOrOptions }
      : { ...FRAME_EXTRACTION_PRESETS.medium, ...frameCountOrOptions }

    const url = URL.createObjectURL(videoBlob)
    video.src = url
    video.muted = true
    video.playsInline = true
    const frames: string[] = []

    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.src = ''
      video.load()
    }

    video.onloadedmetadata = () => {
      const duration = video.duration

      // Verificar se a duração é válida
      if (!isFinite(duration) || isNaN(duration) || duration <= 0) {
        cleanup()
        reject(new Error('Duração do vídeo inválida'))
        return
      }

      // Auto-adjust frame count based on duration if using default
      const effectiveOptions = typeof frameCountOrOptions === 'number'
        ? options
        : { ...options, ...getOptimalFrameSettings(duration) }

      // Calculate canvas dimensions maintaining aspect ratio
      const videoAspect = video.videoWidth / video.videoHeight
      let targetWidth = Math.min(video.videoWidth, effectiveOptions.maxWidth)
      let targetHeight = Math.round(targetWidth / videoAspect)

      if (targetHeight > effectiveOptions.maxHeight) {
        targetHeight = effectiveOptions.maxHeight
        targetWidth = Math.round(targetHeight * videoAspect)
      }

      canvas.width = targetWidth
      canvas.height = targetHeight

      const frameCount = effectiveOptions.frameCount
      const interval = duration / (frameCount + 1)
      let currentFrame = 0

      const captureFrame = () => {
        if (currentFrame >= frameCount) {
          cleanup()
          resolve(frames)
          return
        }

        const targetTime = interval * (currentFrame + 1)

        // Garantir que o tempo é finito e dentro dos limites
        if (!isFinite(targetTime) || targetTime < 0 || targetTime > duration) {
          currentFrame++
          captureFrame()
          return
        }

        video.currentTime = targetTime
      }

      // Timeout de segurança (scaled by frame count)
      const timeout = setTimeout(() => {
        cleanup()
        if (frames.length > 0) {
          resolve(frames)
        } else {
          reject(new Error('Timeout ao extrair frames'))
        }
      }, 10000 + (frameCount * 1000))

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const frameData = canvas.toDataURL('image/jpeg', effectiveOptions.quality)
          frames.push(frameData.split(',')[1])
        } catch (e) {
          console.warn('Erro ao capturar frame:', e)
        }
        currentFrame++

        if (currentFrame >= frameCount) {
          clearTimeout(timeout)
          cleanup()
          resolve(frames)
        } else {
          captureFrame()
        }
      }

      captureFrame()
    }

    video.onerror = () => {
      cleanup()
      reject(new Error('Erro ao carregar vídeo'))
    }

    // Forçar carregamento
    video.load()
  })
}

/**
 * Extract frames with automatic quality adjustment based on target size
 * @param videoBlob - Video blob
 * @param targetSizeMB - Target total size in MB for all frames
 * @returns Array of base64 frame strings
 */
export async function extractFramesWithSizeLimit(
  videoBlob: Blob,
  targetSizeMB: number = 2
): Promise<string[]> {
  // Start with high quality and reduce if needed
  const qualities: VideoQuality[] = ['high', 'medium', 'low']

  for (const quality of qualities) {
    try {
      const frames = await extractFramesFromVideo(videoBlob, FRAME_EXTRACTION_PRESETS[quality])

      // Estimate total size (base64 is ~33% larger than binary)
      const totalSizeEstimate = frames.reduce((sum, f) => sum + f.length, 0) * 0.75 / (1024 * 1024)

      if (totalSizeEstimate <= targetSizeMB) {
        return frames
      }
    } catch (e) {
      console.warn(`Failed to extract frames at ${quality} quality:`, e)
    }
  }

  // Fallback to lowest quality with fewer frames
  return extractFramesFromVideo(videoBlob, {
    maxWidth: 320,
    maxHeight: 240,
    quality: 0.4,
    frameCount: 3
  })
}
