import type { AnalysisResult } from '@/types/ai-coach'

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
 * @param frameCount - Número de frames a extrair (padrão: 5)
 * @returns Array de strings base64 das imagens
 */
export async function extractFramesFromVideo(
  videoBlob: Blob,
  frameCount: number = 5
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Canvas context não disponível'))
      return
    }

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

      canvas.width = Math.min(video.videoWidth || 640, 640)
      canvas.height = Math.min(video.videoHeight || 480, 480)

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

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const frameData = canvas.toDataURL('image/jpeg', 0.7)
          frames.push(frameData.split(',')[1])
        } catch (e) {
          console.warn('Erro ao capturar frame:', e)
        }
        currentFrame++
        captureFrame()
      }

      // Timeout de segurança
      const timeout = setTimeout(() => {
        cleanup()
        if (frames.length > 0) {
          resolve(frames)
        } else {
          reject(new Error('Timeout ao extrair frames'))
        }
      }, 10000)

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const frameData = canvas.toDataURL('image/jpeg', 0.7)
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
