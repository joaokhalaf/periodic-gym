import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { drawLandmarks } from '@/lib/drawing';
import { BiomechanicalAnalysis, analyzeExercise } from '@/lib/geometry';
import { Point } from 'framer-motion';

type RepState = 'UP' | 'DOWN' | 'TRANSITIONING';

interface RepData {
  count: number;
  duration: number;
  quality: number;
  timestamp: number;
}

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
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const requestRef = useRef<number>(0);
  const lastProcessedTime = useRef<number>(0);

  const repState = useRef<RepState>('UP');
  const repStartTime = useRef<number>(0);
  const lastRepTime = useRef<number>(0);
  const repHistory = useRef<RepData[]>([]);
  const qualitySum = useRef<number>(0);
  const repCountRef = useRef<number>(0); // Ref para evitar recriação do useCallback

  // Buffer para suavização de métricas (evita falsos positivos)
  const metricBuffer = useRef<number[]>([]);
  const BUFFER_SIZE = 5; // 5 frames para confirmar mudança de estado

  // Thresholds por exercício
  const thresholds = useRef({
    'remada': { up: 150, down: 80 },
    'agachamento': { up: 150, down: 100 },
    'flexão': { up: 150, down: 90 },
    'levantamento terra': { up: 160, down: 120 },
    'supino': { up: 160, down: 80 },
    'default': { up: 150, down: 90 }
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
    repHistory.current = [];
    qualitySum.current = 0;
    repState.current = 'UP';
    metricBuffer.current = [];
  }, [selectedExercise]);

  /**
   * Adiciona valor ao buffer e retorna a média suavizada
   */
  const smoothMetric = (value: number): number => {
    metricBuffer.current.push(value);
    if (metricBuffer.current.length > BUFFER_SIZE) {
      metricBuffer.current.shift();
    }
    return metricBuffer.current.reduce((a, b) => a + b, 0) / metricBuffer.current.length;
  };

  const getThresholds = () => {
    const exerciseLower = selectedExercise.toLowerCase();
    for (const [key, value] of Object.entries(thresholds.current)) {
      if (exerciseLower.includes(key)) return value;
    }
    return thresholds.current.default;
  };

  const detectRep = (analysis: BiomechanicalAnalysis): boolean => {
    if (!analysis.isValid || !analysis.metrics) return false;

    let primaryAngle = 0;
    const exerciseLower = selectedExercise.toLowerCase();

    if (exerciseLower.includes('remada') || exerciseLower.includes('flexão') || exerciseLower.includes('supino')) {
      primaryAngle = analysis.metrics.elbowAngle || 180;
    } else if (exerciseLower.includes('agachamento')) {
      primaryAngle = analysis.metrics.kneeAngle || 180;
    } else if (exerciseLower.includes('terra')) {
      primaryAngle = analysis.metrics.hipAngle || 180;
    } else {
      primaryAngle = analysis.metrics.elbowAngle || analysis.metrics.kneeAngle || 180;
    }

    const smoothed = smoothMetric(primaryAngle);
    const { up, down } = getThresholds();
    const now = Date.now();

    // Máquina de estados para contagem
    if (repState.current === 'UP' && smoothed < down) {
      repState.current = 'TRANSITIONING';
      repStartTime.current = now;
      return false;
    }
    else if (repState.current === 'TRANSITIONING' && smoothed > up) {
      // Completou subida - REP VÁLIDA!
      const duration = (now - repStartTime.current) / 1000;

      if (now - lastRepTime.current < 500) {
        return false;
      }

      repState.current = 'UP';
      lastRepTime.current = now;

      const repData: RepData = {
        count: repCountRef.current + 1,
        duration,
        quality: analysis.quality,
        timestamp: now
      };

      repHistory.current.push(repData);
      qualitySum.current += analysis.quality;

      setLastRepDuration(duration);
      setAvgQuality(qualitySum.current / repHistory.current.length);


      return true;
    }
    else if (repState.current === 'DOWN' && smoothed > up) {
      // Voltou para cima sem completar
      repState.current = 'UP';
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
    isModelLoaded,
    repHistory: repHistory.current
  };
}