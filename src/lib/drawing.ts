import { Point } from "./geometry";

export const POSE_CONNECTIONS = [
  [11, 12], // Shoulders
  [11, 13], [13, 15], // Left Arm
  [12, 14], [14, 16], // Right Arm
  [11, 23], [12, 24], // Torso
  [23, 24], // Hips
  [23, 25], [25, 27], // Left Leg
  [24, 26], [26, 28]  // Right Leg
];

export function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: Point[],
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  // Draw connections
  ctx.strokeStyle = '#00FF00';
  ctx.lineWidth = 2;

  POSE_CONNECTIONS.forEach(([startIdx, endIdx]) => {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];

    if (start && end && (start.visibility ?? 1) > 0.5 && (end.visibility ?? 1) > 0.5) {
      ctx.beginPath();
      ctx.moveTo(start.x * width, start.y * height);
      ctx.lineTo(end.x * width, end.y * height);
      ctx.stroke();
    }
  });

  // Draw points
  ctx.fillStyle = '#FF0000';
  landmarks.forEach((point) => {
    if ((point.visibility ?? 1) > 0.5) {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
}
