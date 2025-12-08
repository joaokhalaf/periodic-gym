export interface Point {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface BiomechanicalAnalysis {
  feedback: string[];
  metrics: {
    [key: string]: number;
  };
  phase: 'eccentric' | 'concentric' | 'isometric' | 'rest';
  isValid: boolean;
  quality: number; // 0-100
}

export function calculateAngle(a: Point, b: Point, c: Point): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

export function calculateDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isVisible(point: Point, threshold = 0.5): boolean {
  return (point.visibility ?? 1) >= threshold;
}

function validateLandmarks(landmarks: Point[], indices: number[]): boolean {
  return indices.every(i => landmarks[i] && isVisible(landmarks[i]));
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
      quality: 0
    };
  }

  const shoulder = landmarks[11];
  const elbow = landmarks[13];
  const wrist = landmarks[15];
  const hip = landmarks[23];
  const ankle = landmarks[27];
  const shoulderR = landmarks[12];

  const feedback: string[] = [];
  const metrics: { [key: string]: number } = {};
  let quality = 100;

  const elbowAngle = calculateAngle(shoulder, elbow, wrist);
  metrics.elbowAngle = elbowAngle;

  const torsoAngle = calculateAngle(shoulder, hip, ankle);
  metrics.torsoAngle = torsoAngle;

  if (torsoAngle > 160) {
    feedback.push('Incline o tronco para frente (~45°)');
    quality -= 15;
  } else if (torsoAngle < 100) {
    feedback.push('Não incline demais - proteja a lombar');
    quality -= 20;
  } else if (torsoAngle >= 120 && torsoAngle <= 150) {
    feedback.push('Inclinação do tronco perfeita');
  }

  const shoulderDist = Math.abs(shoulder.y - shoulderR.y);
  if (shoulderDist > 0.05) {
    feedback.push('Mantenha os ombros alinhados - sem rotação');
    quality -= 15;
  }

  if (elbowAngle > 160) {
    feedback.push('Braço estendido - inicie a puxada');
  } else if (elbowAngle < 60) {
    feedback.push('Puxada muito curta - estenda mais o braço');
    quality -= 10;
  }

  const elbowTorsoDistance = Math.abs(elbow.x - hip.x);
  metrics.elbowProximity = elbowTorsoDistance;

  if (elbowTorsoDistance > 0.15) {
    feedback.push('Mantenha o cotovelo próximo ao corpo');
    quality -= 10;
  }

  // Determinar fase do movimento
  let phase: 'eccentric' | 'concentric' | 'isometric' | 'rest';
  if (elbowAngle > 150) {
    phase = 'eccentric'; // Descida/Extensão
  } else if (elbowAngle < 90) {
    phase = 'concentric'; // Subida/Contração
  } else {
    phase = 'isometric'; // Meio do movimento
  }

  return {
    feedback,
    metrics,
    phase,
    isValid: true,
    quality: Math.max(0, quality)
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
      quality: 0
    };
  }

  const shoulder = landmarks[11];
  const hipL = landmarks[23];
  const hipR = landmarks[24];
  const kneeL = landmarks[25];
  const kneeR = landmarks[26];
  const ankleL = landmarks[27];

  const feedback: string[] = [];
  const metrics: { [key: string]: number } = {};
  let quality = 100;

  // Ângulo do joelho (principal métrica para profundidade)
  const kneeAngle = calculateAngle(hipL, kneeL, ankleL);
  metrics.kneeAngle = kneeAngle;

  // Profundidade do agachamento
  if (kneeAngle > 160) {
    feedback.push('Posição inicial - desça controladamente');
  } else if (kneeAngle < 90) {
    feedback.push('Profundidade completa! Excelente');
  } else if (kneeAngle < 120) {
    feedback.push('Boa profundidade - paralelo atingido');
  } else if (kneeAngle < 140) {
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

  // Alinhamento do joelho (não deve ultrapassar a ponta do pé)
  const kneeToeTooFar = kneeL.x - ankleL.x;
  if (Math.abs(kneeToeTooFar) > 0.1) {
    feedback.push('Joelho ultrapassando a ponta do pé');
    quality -= 15;
  }

  // Simetria entre pernas
  const kneeAngleR = calculateAngle(hipR, kneeR, landmarks[28]);
  const asymmetry = Math.abs(kneeAngle - kneeAngleR);
  if (asymmetry > 15) {
    feedback.push('Distribua o peso uniformemente entre as pernas');
    quality -= 10;
  }

  // Determinar fase
  let phase: 'eccentric' | 'concentric' | 'isometric' | 'rest';
  if (kneeAngle > 150) {
    phase = 'rest'; // Em pé
  } else if (kneeAngle < 110) {
    phase = 'concentric'; // Subindo do fundo
  } else {
    phase = 'eccentric'; // Descendo
  }

  return {
    feedback,
    metrics,
    phase,
    isValid: true,
    quality: Math.max(0, quality)
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
      quality: 0
    };
  }

  const shoulder = landmarks[11];
  const elbow = landmarks[13];
  const wrist = landmarks[15];
  const hip = landmarks[23];
  const knee = landmarks[25];
  const ankle = landmarks[27];

  const feedback: string[] = [];
  const metrics: { [key: string]: number } = {};
  let quality = 100;

  // Ângulo do cotovelo (determina a profundidade)
  const elbowAngle = calculateAngle(shoulder, elbow, wrist);
  metrics.elbowAngle = elbowAngle;

  if (elbowAngle > 160) {
    feedback.push('Posição inicial - desça controladamente');
  } else if (elbowAngle < 90) {
    feedback.push('Profundidade completa! Ótima execução');
  } else if (elbowAngle < 120) {
    feedback.push('Boa profundidade - continue');
  } else {
    feedback.push('Desça mais para aproveitar o movimento completo');
    quality -= 15;
  }

  // Alinhamento corporal (linha reta ombro-quadril-tornozelo)
  const bodyAngle = calculateAngle(shoulder, hip, ankle);
  metrics.bodyAlignment = bodyAngle;

  if (bodyAngle < 160) {
    feedback.push('Quadril muito alto - mantenha o corpo reto');
    quality -= 20;
  } else if (bodyAngle > 190) {
    feedback.push('Quadril caído - ative o core');
    quality -= 20;
  } else {
    feedback.push('Alinhamento corporal perfeito');
  }

  // Posição dos cotovelos (devem estar próximos ao corpo)
  const elbowFlare = Math.abs(elbow.x - shoulder.x);
  metrics.elbowFlare = elbowFlare;

  if (elbowFlare > 0.15) {
    feedback.push('Cotovelos muito abertos - aproxime do corpo');
    quality -= 10;
  }

  // Determinar fase
  let phase: 'eccentric' | 'concentric' | 'isometric' | 'rest';
  if (elbowAngle > 150) {
    phase = 'rest'; // Topo
  } else if (elbowAngle < 110) {
    phase = 'concentric'; // Subindo
  } else {
    phase = 'eccentric'; // Descendo
  }

  return {
    feedback,
    metrics,
    phase,
    isValid: true,
    quality: Math.max(0, quality)
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
    quality: 0
  };
}