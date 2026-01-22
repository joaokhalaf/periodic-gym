# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PeriodicGym is a fitness tracking application with AI-powered exercise coaching. The main feature is a real-time AI coach that analyzes exercise form using the device camera and provides feedback. The application is in Portuguese (Brazilian).

## Development Commands

```bash
npm run dev      # Start dev server with Turbopack
npm run build    # Production build with Turbopack
npm start        # Start production server
```

## Architecture

### Tech Stack
- **Next.js 15** with App Router and Turbopack
- **React 19**
- **TypeScript**
- **Tailwind CSS v4** with shadcn/ui components
- **MediaPipe** for pose detection (client-side)
- **Google Gemini API** for video analysis (server-side)

### Key Features Flow

**AI Coach (`/ai-coach`):**
1. User selects exercise and enables camera via `useCamera` hook
2. `usePoseAnalysis` hook loads MediaPipe PoseLandmarker and runs real-time analysis
3. Biomechanical analysis happens in `src/lib/geometry.ts` - calculates joint angles and provides form feedback
4. Video recording uses `useRecording` hook
5. Recorded videos are sent to `/api/v1/analyze` which uses Gemini for detailed analysis
6. Sessions are persisted to IndexedDB via `src/lib/db.ts`

### Directory Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── api/v1/analyze/  # Gemini video analysis endpoint
│   ├── ai-coach/        # Main AI coaching feature
│   ├── dashboard/       # User dashboard
│   ├── workout/         # Workout tracking
│   └── login/           # Authentication
├── components/
│   ├── ai-coach/        # AI coach specific components
│   ├── landing/         # Landing page components
│   └── ui/              # shadcn/ui components
├── hooks/               # Custom React hooks
│   ├── useCamera.ts     # Camera stream management
│   ├── useRecording.ts  # Video recording
│   └── usePoseAnalysis.ts # MediaPipe pose detection
├── lib/
│   ├── db.ts            # IndexedDB operations
│   ├── geometry.ts      # Biomechanical calculations
│   ├── drawing.ts       # Canvas landmark rendering
│   └── video-utils.ts   # Video processing utilities
└── types/
    └── ai-coach.ts      # TypeScript interfaces
```

### Exercise Analysis

The system analyzes three exercises with specific biomechanical checks in `src/lib/geometry.ts`:
- **Remada Curvada (Bent-over Row)**: Elbow angle, torso inclination, shoulder alignment, shoulder rotation (using z-depth)
- **Agachamento (Squat)**: Knee angle, depth, torso angle, knee-forward ratio, leg asymmetry, lateral hip shift
- **Flexão (Push-up)**: Elbow angle, body alignment (using point-to-line distance), elbow flare, elbow depth

Each returns a `BiomechanicalAnalysis` with:
- `feedback`: Array of actionable feedback strings
- `metrics`: Object with calculated angles and measurements
- `phase`: Movement phase ('eccentric', 'concentric', 'isometric', 'rest')
- `quality`: Score 0-100
- `confidence`: Average landmark visibility (0-1)

### Geometry & Math Utilities

`src/lib/geometry.ts` provides:
- `calculateAngle(a, b, c)`: 3D vector-based angle calculation at vertex b
- `calculateAngle2D(a, b, c)`: 2D angle (ignores z-axis) for side-view analysis
- `calculateWeightedAngle()`: Returns angle with confidence based on landmark visibility
- `pointToLineDistance()`: Perpendicular distance for body alignment checks
- Vector utilities: `dotProduct`, `crossProduct`, `magnitude`, `subtractVectors`

### Video Processing

`src/lib/video-utils.ts` handles video size optimization:
- `VIDEO_QUALITY_PRESETS`: Low (480p), Medium (720p), High (1080p) presets
- `extractFramesWithSizeLimit(blob, targetMB)`: Auto-adjusts quality to stay under size limit
- `getOptimalFrameSettings(duration)`: Selects frame count based on video duration

### Camera Quality

`src/hooks/useCamera.ts` supports:
- Auto-detection of device camera capabilities
- Quality presets via `VIDEO_QUALITY_PRESETS` ('low', 'medium', 'high')
- Runtime quality switching via `switchQuality()`
- Logs actual resolution obtained

### Pose Analysis

`src/hooks/usePoseAnalysis.ts` features:
- Weighted exponential moving average for angle smoothing
- Confidence-based filtering (MIN_CONFIDENCE_THRESHOLD = 0.5)
- Hysteresis in state machine to prevent false rep counts
- Rep validation: duration must be 0.3s - 10s

### Environment Variables

Required in `.env`:
- `GEMINI_API_KEY` - Google Gemini API key for video analysis
