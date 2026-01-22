export interface Point {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface BiomechanicalAnalysis {
  feedback: string[];
  metrics: {
    [key: string]: number;
  };
  phase: 'eccentric' | 'concentric' | 'isometric' | 'rest';
  isValid: boolean;
  quality: number; // 0-100
  confidence: number; // 0-1 average visibility of used landmarks
}

// Vector math utilities for 3D calculations
function toVector3D(p: Point): Vector3D {
  return { x: p.x, y: p.y, z: p.z ?? 0 };
}

function subtractVectors(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dotProduct(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function crossProduct(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

/**
 * Calculate angle between three points using 3D vector math
 * Returns angle at point b (vertex) in degrees
 */
export function calculateAngle(a: Point, b: Point, c: Point): number {
  const va = toVector3D(a);
  const vb = toVector3D(b);
  const vc = toVector3D(c);

  const ba = subtractVectors(va, vb);
  const bc = subtractVectors(vc, vb);

  const dot = dotProduct(ba, bc);
  const magBA = magnitude(ba);
  const magBC = magnitude(bc);

  if (magBA === 0 || magBC === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

/**
 * Calculate 2D angle (ignoring z) - useful for side view analysis
 */
export function calculateAngle2D(a: Point, b: Point, c: Point): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

/**
 * Calculate 3D distance between two points
 */
export function calculateDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate 2D distance (ignoring z)
 */
export function calculateDistance2D(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get average visibility/confidence of a set of landmarks
 */
export function getAverageConfidence(landmarks: Point[], indices: number[]): number {
  const validPoints = indices.filter(i => landmarks[i]);
  if (validPoints.length === 0) return 0;

  const sum = validPoints.reduce((acc, i) => acc + (landmarks[i].visibility ?? 1), 0);
  return sum / validPoints.length;
}

/**
 * Weighted angle calculation based on landmark confidence
 */
export function calculateWeightedAngle(a: Point, b: Point, c: Point): { angle: number; confidence: number } {
  const angle = calculateAngle(a, b, c);
  const confidence = Math.min(
    a.visibility ?? 1,
    b.visibility ?? 1,
    c.visibility ?? 1
  );
  return { angle, confidence };
}

function isVisible(point: Point, threshold = 0.5): boolean {
  return (point.visibility ?? 1) >= threshold;
}

function validateLandmarks(landmarks: Point[], indices: number[]): boolean {
  return indices.every(i => landmarks[i] && isVisible(landmarks[i]));
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Calculate the perpendicular distance from point p to line defined by a-b
 */
export function pointToLineDistance(p: Point, a: Point, b: Point): number {
  const va = toVector3D(a);
  const vb = toVector3D(b);
  const vp = toVector3D(p);

  const ab = subtractVectors(vb, va);
  const ap = subtractVectors(vp, va);

  const cross = crossProduct(ab, ap);
  const crossMag = magnitude(cross);
  const abMag = magnitude(ab);

  if (abMag === 0) return magnitude(ap);
  return crossMag / abMag;
}


export function analyzeBackRow(landmarks: Point[]): BiomechanicalAnalysis {
  // Índices: 11-Ombro Esq, 13-Cotovelo Esq, 15-Punho Esq
  // 23-Quadril Esq, 27-Tornozelo Esq, 12-Ombro Dir

  const requiredPoints = [11, 13, 15, 23, 27, 12];
  if (!validateLandmarks(landmarks, requiredPoints)) {
    return {
      feedback: ['Posicione-se de lado para a câmera'],
      metrics: {},
      phase: 'rest',
      isValid: false,
      quality: 0,
      confidence: 0
    };
  }

  const shoulder = landmarks[11];
  const elbow = landmarks[13];
  const wrist = landmarks[15];
  const hip = landmarks[23];
  const ankle = landmarks[27];
  const shoulderR = landmarks[12];

  const confidence = getAverageConfidence(landmarks, requiredPoints);
  const feedback: string[] = [];
  const metrics: { [key: string]: number } = {};
  let quality = 100;

  // Use 2D angle for side-view exercises
  const elbowResult = calculateWeightedAngle(shoulder, elbow, wrist);
  metrics.elbowAngle = elbowResult.angle;
  metrics.elbowConfidence = elbowResult.confidence;

  const torsoAngle = calculateAngle2D(shoulder, hip, ankle);
  metrics.torsoAngle = torsoAngle;

  // Torso inclination check with graduated feedback
  if (torsoAngle > 160) {
    feedback.push('Incline o tronco para frente (~45°)');
    quality -= 15;
  } else if (torsoAngle < 100) {
    feedback.push('Não incline demais - proteja a lombar');
    quality -= 20;
  } else if (torsoAngle >= 120 && torsoAngle <= 150) {
    feedback.push('Inclinação do tronco perfeita');
  }

  // Shoulder alignment using Z-depth when available
  const shoulderYDist = Math.abs(shoulder.y - shoulderR.y);
  const shoulderZDist = Math.abs((shoulder.z ?? 0) - (shoulderR.z ?? 0));
  metrics.shoulderAlignment = shoulderYDist;
  metrics.shoulderRotation = shoulderZDist;

  if (shoulderYDist > 0.05 || shoulderZDist > 0.1) {
    feedback.push('Mantenha os ombros alinhados - sem rotação');
    quality -= 15;
  }

  if (elbowResult.angle > 160) {
    feedback.push('Braço estendido - inicie a puxada');
  } else if (elbowResult.angle < 60) {
    feedback.push('Puxada muito curta - estenda mais o braço');
    quality -= 10;
  }

  // Elbow proximity to torso using 2D distance
  const elbowTorsoDistance = calculateDistance2D(elbow, hip);
  metrics.elbowProximity = elbowTorsoDistance;

  if (elbowTorsoDistance > 0.15) {
    feedback.push('Mantenha o cotovelo próximo ao corpo');
    quality -= 10;
  }

  // Determinar fase do movimento
  let phase: 'eccentric' | 'concentric' | 'isometric' | 'rest';
  if (elbowResult.angle > 150) {
    phase = 'eccentric'; // Descida/Extensão
  } else if (elbowResult.angle < 90) {
    phase = 'concentric'; // Subida/Contração
  } else {
    phase = 'isometric'; // Meio do movimento
  }

  return {
    feedback,
    metrics,
    phase,
    isValid: true,
    quality: Math.max(0, Math.round(quality)),
    confidence
  };
}

export function analyzeSquat(landmarks: Point[]): BiomechanicalAnalysis {
  // Índices: 23-Quadril Esq, 25-Joelho Esq, 27-Tornozelo Esq
  // 11-Ombro Esq, 24-Quadril Dir, 26-Joelho Dir
  const requiredPoints = [11, 23, 24, 25, 26, 27, 28];
  if (!validateLandmarks(landmarks, requiredPoints)) {
    return {
      feedback: ['Posicione-se de frente ou de costas para a câmera'],
      metrics: {},
      phase: 'rest',
      isValid: false,
      quality: 0,
      confidence: 0
    };
  }

  const shoulder = landmarks[11];
  const hipL = landmarks[23];
  const hipR = landmarks[24];
  const kneeL = landmarks[25];
  const kneeR = landmarks[26];
  const ankleL = landmarks[27];
  const ankleR = landmarks[28];

  const confidence = getAverageConfidence(landmarks, requiredPoints);
  const feedback: string[] = [];
  const metrics: { [key: string]: number } = {};
  let quality = 100;

  // Ângulo do joelho com confiança
  const kneeResult = calculateWeightedAngle(hipL, kneeL, ankleL);
  metrics.kneeAngle = kneeResult.angle;
  metrics.kneeConfidence = kneeResult.confidence;

  // Profundidade do agachamento
  if (kneeResult.angle > 160) {
    feedback.push('Posição inicial - desça controladamente');
  } else if (kneeResult.angle < 90) {
    feedback.push('Profundidade completa! Excelente');
  } else if (kneeResult.angle < 120) {
    feedback.push('Boa profundidade - paralelo atingido');
  } else if (kneeResult.angle < 140) {
    feedback.push('Desça um pouco mais para profundidade ideal');
    quality -= 10;
  }

  // Alinhamento das costas
  const torsoAngle = calculateAngle(shoulder, hipL, kneeL);
  metrics.torsoAngle = torsoAngle;

  if (torsoAngle < 140) {
    feedback.push('Mantenha o peito erguido - costas muito inclinadas');
    quality -= 15;
  } else if (torsoAngle > 180) {
    feedback.push('Não incline para trás demais');
    quality -= 10;
  }

  // Alinhamento do joelho usando distância 2D
  const kneeAnkleDist = calculateDistance2D(kneeL, ankleL);
  const kneeForwardRatio = (kneeL.x - ankleL.x) / Math.max(kneeAnkleDist, 0.01);
  metrics.kneeForwardRatio = kneeForwardRatio;

  if (Math.abs(kneeForwardRatio) > 0.3) {
    feedback.push('Joelho ultrapassando a ponta do pé');
    quality -= 15;
  }

  // Simetria entre pernas com melhor cálculo
  const kneeAngleR = calculateAngle(hipR, kneeR, ankleR);
  const asymmetry = Math.abs(kneeResult.angle - kneeAngleR);
  metrics.legAsymmetry = asymmetry;

  if (asymmetry > 15) {
    feedback.push('Distribua o peso uniformemente entre as pernas');
    quality -= Math.min(20, Math.round(asymmetry * 0.5));
  }

  // Hip alignment (check for lateral shift)
  const hipCenterX = (hipL.x + hipR.x) / 2;
  const ankleCenterX = (ankleL.x + ankleR.x) / 2;
  const lateralShift = Math.abs(hipCenterX - ankleCenterX);
  metrics.lateralShift = lateralShift;

  if (lateralShift > 0.08) {
    feedback.push('Mantenha o quadril centralizado');
    quality -= 10;
  }

  // Determinar fase
  let phase: 'eccentric' | 'concentric' | 'isometric' | 'rest';
  if (kneeResult.angle > 150) {
    phase = 'rest'; // Em pé
  } else if (kneeResult.angle < 110) {
    phase = 'concentric'; // Subindo do fundo
  } else {
    phase = 'eccentric'; // Descendo
  }

  return {
    feedback,
    metrics,
    phase,
    isValid: true,
    quality: Math.max(0, Math.round(quality)),
    confidence
  };
}

export function analyzePushUp(landmarks: Point[]): BiomechanicalAnalysis {
  // Índices: 11-Ombro Esq, 13-Cotovelo Esq, 15-Punho Esq
  // 23-Quadril Esq, 25-Joelho Esq, 27-Tornozelo Esq
  const requiredPoints = [11, 13, 15, 23, 25, 27];
  if (!validateLandmarks(landmarks, requiredPoints)) {
    return {
      feedback: ['Posicione-se de lado para a câmera'],
      metrics: {},
      phase: 'rest',
      isValid: false,
      quality: 0,
      confidence: 0
    };
  }

  const shoulder = landmarks[11];
  const elbow = landmarks[13];
  const wrist = landmarks[15];
  const hip = landmarks[23];
  const ankle = landmarks[27];

  const confidence = getAverageConfidence(landmarks, requiredPoints);
  const feedback: string[] = [];
  const metrics: { [key: string]: number } = {};
  let quality = 100;

  // Ângulo do cotovelo com confiança
  const elbowResult = calculateWeightedAngle(shoulder, elbow, wrist);
  metrics.elbowAngle = elbowResult.angle;
  metrics.elbowConfidence = elbowResult.confidence;

  if (elbowResult.angle > 160) {
    feedback.push('Posição inicial - desça controladamente');
  } else if (elbowResult.angle < 90) {
    feedback.push('Profundidade completa! Ótima execução');
  } else if (elbowResult.angle < 120) {
    feedback.push('Boa profundidade - continue');
  } else {
    feedback.push('Desça mais para aproveitar o movimento completo');
    quality -= 15;
  }

  // Alinhamento corporal usando distância perpendicular
  // Calculamos quão longe o quadril está da linha ombro-tornozelo
  const hipLineDeviation = pointToLineDistance(hip, shoulder, ankle);
  metrics.hipDeviation = hipLineDeviation;

  // Body angle for additional check
  const bodyAngle = calculateAngle2D(shoulder, hip, ankle);
  metrics.bodyAlignment = bodyAngle;

  if (hipLineDeviation > 0.05 || bodyAngle < 160) {
    feedback.push('Quadril muito alto - mantenha o corpo reto');
    quality -= 20;
  } else if (bodyAngle > 190) {
    feedback.push('Quadril caído - ative o core');
    quality -= 20;
  } else {
    feedback.push('Alinhamento corporal perfeito');
  }

  // Posição dos cotovelos - using 3D distance when z is available
  const elbowShoulderDist = calculateDistance(elbow, shoulder);
  const elbowFlare = Math.abs(elbow.x - shoulder.x);
  metrics.elbowFlare = elbowFlare;
  metrics.elbowShoulderDist = elbowShoulderDist;

  // Check both horizontal flare and forward position
  if (elbowFlare > 0.15) {
    feedback.push('Cotovelos muito abertos - aproxime do corpo');
    quality -= 10;
  }

  // Check elbow depth relative to shoulder (using z)
  const elbowDepthDiff = (elbow.z ?? 0) - (shoulder.z ?? 0);
  metrics.elbowDepth = elbowDepthDiff;

  // Determinar fase
  let phase: 'eccentric' | 'concentric' | 'isometric' | 'rest';
  if (elbowResult.angle > 150) {
    phase = 'rest'; // Topo
  } else if (elbowResult.angle < 110) {
    phase = 'concentric'; // Subindo
  } else {
    phase = 'eccentric'; // Descendo
  }

  return {
    feedback,
    metrics,
    phase,
    isValid: true,
    quality: Math.max(0, Math.round(quality)),
    confidence
  };
}

export function analyzeExercise(
  exercise: string,
  landmarks: Point[]
): BiomechanicalAnalysis {
  const exerciseLower = exercise.toLowerCase();

  if (exerciseLower.includes('remada') || exerciseLower.includes('row')) {
    return analyzeBackRow(landmarks);
  }

  if (exerciseLower.includes('agachamento') || exerciseLower.includes('squat')) {
    return analyzeSquat(landmarks);
  }

  if (exerciseLower.includes('flexão') || exerciseLower.includes('push') || exerciseLower.includes('pushup')) {
    return analyzePushUp(landmarks);
  }

  return {
    feedback: ['Exercício não reconhecido'],
    metrics: {},
    phase: 'rest',
    isValid: false,
    quality: 0,
    confidence: 0
  };
}