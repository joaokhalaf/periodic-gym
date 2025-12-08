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
