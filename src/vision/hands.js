import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/models/hand_landmarker.task'

export async function createTracker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  try {
    return await HandLandmarker.createFromOptions(fileset, options('GPU'))
  } catch {
    return await HandLandmarker.createFromOptions(fileset, options('CPU'))
  }
}

/**
 * Maps normalised, un-mirrored video coordinates to mirrored screen space,
 * matching how the video is drawn with object-fit: cover.
 */
export function makeProjector(view, video) {
  const vw = video.videoWidth || 1280
  const vh = video.videoHeight || 720
  const scale = Math.max(view.w / vw, view.h / vh)
  const dw = vw * scale
  const dh = vh * scale
  const ox = (view.w - dw) / 2
  const oy = (view.h - dh) / 2
  return (x, y) => {
    const px = ox + (1 - x) * dw
    const py = oy + y * dh
    return { px, py, nx: px / view.w, ny: py / view.h }
  }
}

const FINGERS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
]

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * Turns 21 landmarks into the handful of signals the instrument needs:
 * palm position, extended finger count, and a thumb/index pinch.
 */
export function readHand(landmarks, project) {
  const pts = landmarks.map((l) => {
    const p = project(l.x, l.y)
    return [p.px, p.py, p.nx, p.ny]
  })

  const wrist = pts[0]
  const middleMcp = pts[9]
  const scale = dist(wrist, middleMcp) || 1

  const fingers = FINGERS.map(([tip, pip]) => (dist(wrist, pts[tip]) > dist(wrist, pts[pip]) * 1.06 ? 1 : 0))
  let extended = fingers.reduce((a, b) => a + b, 0)

  // An open hand is the dominant 7th, exactly as before. Folding the thumb into
  // the palm while keeping the four fingers up selects the major 7th, so every
  // chord in the app is reachable with the hand alone.
  const thumbOut = dist(pts[4], pts[17]) > dist(pts[2], pts[17]) * 1.18
  if (extended === 4 && !thumbOut) extended = 5

  const pinchRatio = dist(pts[4], pts[8]) / scale

  let cx = 0
  let cy = 0
  let nx = 0
  let ny = 0
  for (const i of [0, 5, 9, 13, 17]) {
    cx += pts[i][0]
    cy += pts[i][1]
    nx += pts[i][2]
    ny += pts[i][3]
  }

  return {
    pts,
    extended,
    fingers,
    thumbOut,
    pinchRatio,
    pinching: pinchRatio < 0.46,
    x: cx / 5,
    y: cy / 5,
    nx: nx / 5,
    ny: ny / 5,
    label:
      extended === 0 ? 'fist' : extended === 5 ? 'thumb tucked' : `${extended} finger${extended > 1 ? 's' : ''}`,
  }
}

export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]
