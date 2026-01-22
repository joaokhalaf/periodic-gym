import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { drawLandmarks } from '@/lib/drawing';
import { BiomechanicalAnalysis, analyzeExercise, Point } from '@/lib/geometry';

type RepState = 'UP' | 'DOWN' | 'TRANSITIONING';

interface RepData {
  count: number;
  duration: number;
  quality: number;
  timestamp: number;
  confidence: number;
}

interface SmoothingBuffer {
  values: number[];
  weights: number[];
}

// Minimum confidence threshold for valid analysis
const MIN_CONFIDENCE_THRESHOLD = 0.5;
const BUFFER_SIZE = 5;

export function usePoseAnalysis(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  isActive: boolean,
  selectedExercise: string
) {
  const [landmarker, setLandmarker] = useState<PoseLandmarker | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string[]>([]);
  const [repCount, setRepCount] = useState(0);
  const [lastRepDuration, setLastRepDuration] = useState<number>(0);
  const [currentPhase, setCurrentPhase] = useState<string>('rest');
  const [avgQuality, setAvgQuality] = useState<number>(0);
  const [avgConfidence, setAvgConfidence] = useState<number>(0);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const requestRef = useRef<number>(0);
  const lastProcessedTime = useRef<number>(0);

  const repState = useRef<RepState>('UP');
  const repStartTime = useRef<number>(0);
  const lastRepTime = useRef<number>(0);
  const repHistory = useRef<RepData[]>([]);
  const qualitySum = useRef<number>(0);
  const confidenceSum = useRef<number>(0);
  const repCountRef = useRef<number>(0);

  // Buffer para suavização de métricas com pesos baseados em confiança
  const metricBuffer = useRef<SmoothingBuffer>({ values: [], weights: [] });

  // Thresholds por exercício com hysteresis
  const thresholds = useRef({
    'remada': { up: 150, down: 80, hysteresis: 10 },
    'agachamento': { up: 150, down: 100, hysteresis: 10 },
    'flexão': { up: 150, down: 90, hysteresis: 8 },
    'levantamento terra': { up: 160, down: 120, hysteresis: 10 },
    'supino': { up: 160, down: 80, hysteresis: 8 },
    'default': { up: 150, down: 90, hysteresis: 10 }
  });

  // Inicializa sistema de análise de movimento
  useEffect(() => {
    const createLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
        );
        const result = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.6,
          minPosePresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        setLandmarker(result);
        setIsModelLoaded(true);
      } catch (error) {
        console.error('[PoseAnalysis] Error loading model:', error);
        setIsModelLoaded(false);
      }
    };
    createLandmarker();
  }, []);

  useEffect(() => {
    setRepCount(0);
    repCountRef.current = 0;
    setAvgQuality(0);
    setAvgConfidence(0);
    repHistory.current = [];
    qualitySum.current = 0;
    confidenceSum.current = 0;
    repState.current = 'UP';
    metricBuffer.current = { values: [], weights: [] };
  }, [selectedExercise]);

  /**
   * Weighted exponential moving average for smoother angle tracking
   * Weight is based on landmark confidence
   */
  const smoothMetric = (value: number, confidence: number): number => {
    const buffer = metricBuffer.current;
    buffer.values.push(value);
    buffer.weights.push(confidence);

    if (buffer.values.length > BUFFER_SIZE) {
      buffer.values.shift();
      buffer.weights.shift();
    }

    // Weighted average with more recent values having higher impact
    let weightedSum = 0;
    let totalWeight = 0;
    const decay = 0.8; // Exponential decay factor

    for (let i = 0; i < buffer.values.length; i++) {
      const recency = Math.pow(decay, buffer.values.length - 1 - i);
      const weight = buffer.weights[i] * recency;
      weightedSum += buffer.values[i] * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : value;
  };

  const getThresholds = () => {
    const exerciseLower = selectedExercise.toLowerCase();
    for (const [key, value] of Object.entries(thresholds.current)) {
      if (exerciseLower.includes(key)) return value;
    }
    return thresholds.current.default;
  };

  /**
   * Get primary angle for the exercise type
   */
  const getPrimaryAngle = (analysis: BiomechanicalAnalysis): { angle: number; confidence: number } => {
    const exerciseLower = selectedExercise.toLowerCase();
    const metrics = analysis.metrics;

    if (exerciseLower.includes('remada') || exerciseLower.includes('flexão') || exerciseLower.includes('supino')) {
      return {
        angle: metrics.elbowAngle ?? 180,
        confidence: metrics.elbowConfidence ?? analysis.confidence
      };
    } else if (exerciseLower.includes('agachamento')) {
      return {
        angle: metrics.kneeAngle ?? 180,
        confidence: metrics.kneeConfidence ?? analysis.confidence
      };
    } else if (exerciseLower.includes('terra')) {
      return {
        angle: metrics.hipAngle ?? 180,
        confidence: analysis.confidence
      };
    }

    return {
      angle: metrics.elbowAngle ?? metrics.kneeAngle ?? 180,
      confidence: analysis.confidence
    };
  };

  const detectRep = (analysis: BiomechanicalAnalysis): boolean => {
    if (!analysis.isValid || !analysis.metrics) return false;

    // Skip low confidence detections
    if (analysis.confidence < MIN_CONFIDENCE_THRESHOLD) return false;

    const { angle: primaryAngle, confidence } = getPrimaryAngle(analysis);
    const smoothed = smoothMetric(primaryAngle, confidence);
    const { up, down, hysteresis } = getThresholds();
    const now = Date.now();

    // State machine with hysteresis for robust rep counting
    if (repState.current === 'UP' && smoothed < (down - hysteresis)) {
      repState.current = 'TRANSITIONING';
      repStartTime.current = now;
      return false;
    }
    else if (repState.current === 'TRANSITIONING' && smoothed > (up + hysteresis)) {
      // Completed rep!
      const duration = (now - repStartTime.current) / 1000;

      // Debounce: minimum time between reps
      if (now - lastRepTime.current < 500) {
        return false;
      }

      // Validate rep duration (too fast or too slow is suspicious)
      if (duration < 0.3 || duration > 10) {
        repState.current = 'UP';
        return false;
      }

      repState.current = 'UP';
      lastRepTime.current = now;

      const repData: RepData = {
        count: repCountRef.current + 1,
        duration,
        quality: analysis.quality,
        timestamp: now,
        confidence: analysis.confidence
      };

      repHistory.current.push(repData);
      qualitySum.current += analysis.quality;
      confidenceSum.current += analysis.confidence;

      setLastRepDuration(duration);
      setAvgQuality(qualitySum.current / repHistory.current.length);
      setAvgConfidence(confidenceSum.current / repHistory.current.length);

      return true;
    }
    else if (repState.current === 'DOWN' && smoothed > (up + hysteresis)) {
      // Returned up without completing
      repState.current = 'UP';
    }
    // Check if in middle of descent
    else if (repState.current === 'TRANSITIONING' && smoothed < (down - hysteresis * 2)) {
      repState.current = 'DOWN';
    }

    return false;
  };

  const analyze = useCallback(() => {
    if (!landmarker || !videoRef.current || videoRef.current.readyState < 2 || !selectedExercise) {
      if (isActive) requestRef.current = requestAnimationFrame(analyze);
      return;
    }

    const now = performance.now();
    if (now - lastProcessedTime.current < 33) {
      if (isActive) requestRef.current = requestAnimationFrame(analyze);
      return;
    }
    lastProcessedTime.current = now;

    try {
      const result = landmarker.detectForVideo(videoRef.current, now);

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0] as Point[];

        // Desenha landmarks no canvas
        if (canvasRef.current && videoRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            drawLandmarks(ctx, landmarks, canvasRef.current.width, canvasRef.current.height);
          }
        }

        // Análise biomecânica
        const analysis = analyzeExercise(selectedExercise, landmarks);

        if (analysis.isValid) {

          setCurrentPhase(analysis.phase);

          const repDetected = detectRep(analysis);
          if (repDetected) {
            repCountRef.current += 1;
            setRepCount(repCountRef.current);

            // Feedback especial ao completar rep
            if (analysis.quality >= 80) {
              setAiFeedback(prev => ['🎯 Repetição perfeita!', ...prev.slice(0, 2)]);
            } else if (analysis.quality >= 60) {
              setAiFeedback(prev => ['✅ Boa repetição!', ...prev.slice(0, 2)]);
            } else {
              setAiFeedback(prev => ['⚠️ Rep válida, mas revise a técnica', ...prev.slice(0, 2)]);
            }
          }

          // Atualiza feedback biomecânico (sem spam)
          if (analysis.feedback.length > 0) {
            const latestFeedback = analysis.feedback[0];
            setAiFeedback(prev => {
              if (prev[0] === latestFeedback) return prev;
              return [latestFeedback, ...prev.slice(0, 3)];
            });
          }
        } else {
          // Landmarks insuficientes
          if (analysis.feedback.length > 0) {
            setAiFeedback(prev => {
              if (prev[0] === analysis.feedback[0]) return prev;
              return [analysis.feedback[0], ...prev.slice(0, 2)];
            });
          }
        }
      } else {
        // Limpa canvas se não houver detecção
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }
      }
    } catch (error) {
      console.error('[PoseAnalysis] Error during analysis:', error);
    }

    if (isActive) {
      requestRef.current = requestAnimationFrame(analyze);
    }
  }, [isActive, landmarker, videoRef, canvasRef, selectedExercise]);

  useEffect(() => {
    if (isActive && landmarker && selectedExercise) {
      requestRef.current = requestAnimationFrame(analyze);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isActive, landmarker, selectedExercise, analyze]);

  return {
    aiFeedback,
    repCount,
    lastRepDuration,
    currentPhase,
    avgQuality: Math.round(avgQuality),
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    isModelLoaded,
    repHistory: repHistory.current
  };
}