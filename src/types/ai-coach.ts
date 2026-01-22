export type CameraStatus = "off" | "on" | "error"

export type VideoQuality = 'low' | 'medium' | 'high'

export interface FeedbackItem {
  id: string
  message: string
  type: 'success' | 'warning' | 'error' | 'info'
  timestamp: Date
}

export interface AnalysisResult {
  reps: number
  summary: string
  suggestions: string[]
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  repCount?: number
  formIssues?: string[]
  strengths?: string[]
  recommendations?: string[]
  overallScore?: number
}

export interface Exercise {
  id: string
  name: string
  muscleGroup?: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
}

export interface SessionData {
  id: string
  exercise: string
  date: Date
  reps: number
  duration: number
  videoBlob?: Blob
  analysis?: AnalysisResult
}

export interface VideoQualityPreset {
  width: number
  height: number
  bitrate: number
  frameRate?: number
  label?: string
}

export const VIDEO_QUALITY_PRESETS: Record<VideoQuality, VideoQualityPreset> = {
  low: { width: 640, height: 480, bitrate: 1000000, frameRate: 24, label: 'Baixa (480p)' },
  medium: { width: 1280, height: 720, bitrate: 2500000, frameRate: 30, label: 'Média (720p)' },
  high: { width: 1920, height: 1080, bitrate: 5000000, frameRate: 30, label: 'Alta (1080p)' }
}

export interface FrameExtractionOptions {
  maxWidth: number
  maxHeight: number
  quality: number
  frameCount: number
}

export class RecordingError extends Error {
  constructor(
    message: string,
    public code: 'CAMERA_ACCESS' | 'RECORDING_FAILED' | 'UPLOAD_FAILED'
  ) {
    super(message)
    this.name = 'RecordingError'
  }
}
