export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export const QUALITIES = {
  '5': { suffix: '5', label: 'power chord', intervals: [0, 7, 12] },
  maj: { suffix: '', label: 'major', intervals: [0, 4, 7, 12] },
  min: { suffix: 'm', label: 'minor', intervals: [0, 3, 7, 12] },
  '7': { suffix: '7', label: 'dominant 7th', intervals: [0, 4, 7, 10] },
  maj7: { suffix: 'maj7', label: 'major 7th', intervals: [0, 4, 7, 11] },
}

/**
 * index = fingers up on the fretting hand. 0 is a closed fist (palm mute);
 * 5 is four fingers with the thumb tucked into the palm.
 */
export const QUALITY_BY_FINGERS = [null, '5', 'maj', 'min', '7', 'maj7']

export const STRING_LABELS = ['6th', '5th', '4th', '3rd', '2nd', '1st']

export const TUNINGS = [
  { id: 'standard', name: 'Standard', label: 'E A D G B E', midi: [40, 45, 50, 55, 59, 64] },
  { id: 'dropd', name: 'Drop D', label: 'D A D G B E', midi: [38, 45, 50, 55, 59, 64] },
  { id: 'flat', name: 'Half step down', label: 'E♭ A♭ D♭ G♭ B♭ E♭', midi: [39, 44, 49, 54, 58, 63] },
  { id: 'dadgad', name: 'DADGAD', label: 'D A D G A D', midi: [38, 45, 50, 55, 57, 62] },
  { id: 'openg', name: 'Open G', label: 'D G D G B D', midi: [38, 43, 50, 55, 59, 62] },
]

export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

export function noteName(midi) {
  if (midi == null) return '—'
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)
}

/* ------------------------------------------------------------------ *
 * Hand-realised open-position shapes in standard tuning.
 * null = string not played, 0 = open string.
 * ------------------------------------------------------------------ */
const OPEN = {
  0: { // C
    maj: [null, 3, 2, 0, 1, 0],
    min: [null, 3, 5, 5, 4, 3],
    '7': [null, 3, 2, 3, 1, 0],
    maj7: [null, 3, 2, 0, 0, 0],
    '5': [null, 3, 5, 5, null, null],
  },
  2: { // D
    maj: [null, null, 0, 2, 3, 2],
    min: [null, null, 0, 2, 3, 1],
    '7': [null, null, 0, 2, 1, 2],
    maj7: [null, null, 0, 2, 2, 2],
    '5': [null, null, 0, 2, 3, null],
  },
  4: { // E
    maj: [0, 2, 2, 1, 0, 0],
    min: [0, 2, 2, 0, 0, 0],
    '7': [0, 2, 0, 1, 0, 0],
    maj7: [0, 2, 1, 1, 0, 0],
    '5': [0, 2, 2, null, null, null],
  },
  5: { // F
    maj: [1, 3, 3, 2, 1, 1],
    min: [1, 3, 3, 1, 1, 1],
    '7': [1, 3, 1, 2, 1, 1],
    maj7: [null, null, 3, 2, 1, 0],
    '5': [1, 3, 3, null, null, null],
  },
  7: { // G
    maj: [3, 2, 0, 0, 0, 3],
    min: [3, 5, 5, 3, 3, 3],
    '7': [3, 2, 0, 0, 0, 1],
    maj7: [3, 2, 0, 0, 0, 2],
    '5': [3, 5, 5, null, null, null],
  },
  9: { // A
    maj: [null, 0, 2, 2, 2, 0],
    min: [null, 0, 2, 2, 1, 0],
    '7': [null, 0, 2, 0, 2, 0],
    maj7: [null, 0, 2, 1, 2, 0],
    '5': [null, 0, 2, 2, null, null],
  },
  11: { // B
    maj: [null, 2, 4, 4, 4, 2],
    min: [null, 2, 4, 4, 3, 2],
    '7': [null, 2, 1, 2, 0, 2],
    maj7: [null, 2, 4, 3, 4, 2],
    '5': [null, 2, 4, 4, null, null],
  },
}

const E_SHAPE = {
  maj: [0, 2, 2, 1, 0, 0],
  min: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  '5': [0, 2, 2, null, null, null],
}

const A_SHAPE = {
  maj: [null, 0, 2, 2, 2, 0],
  min: [null, 0, 2, 2, 1, 0],
  '7': [null, 0, 2, 0, 2, 0],
  maj7: [null, 0, 2, 1, 2, 0],
  '5': [null, 0, 2, 2, null, null],
}

function barreStandard(rootPc, quality) {
  const fE = (((rootPc - 4) % 12) + 12) % 12
  const fA = (((rootPc - 9) % 12) + 12) % 12
  const useE = fE <= fA
  const shape = useE ? E_SHAPE[quality] : A_SHAPE[quality]
  const base = useE ? fE : fA
  return shape.map((f) => (f == null ? null : f + base))
}

/**
 * Voicing search for non-standard tunings: put the root on the lowest string,
 * then walk up the neck picking chord tones that sit under the hand.
 */
function generatedVoicing(tuningMidi, rootPc, quality) {
  const tones = new Set(QUALITIES[quality].intervals.map((i) => (rootPc + i) % 12))
  const frets = new Array(6).fill(null)

  // root under the hand: low E first, then the A string, within reach
  let baseString = 0
  let base = -1
  for (const s of [0, 1]) {
    for (let f = 0; f <= 7; f++) {
      if ((tuningMidi[s] + f) % 12 === rootPc) {
        baseString = s
        base = f
        break
      }
    }
    if (base >= 0) break
  }
  if (base < 0) {
    baseString = 0
    for (let f = 0; f <= 11; f++) {
      if ((tuningMidi[0] + f) % 12 === rootPc) {
        base = f
        break
      }
    }
  }
  if (base < 0) return frets

  frets[baseString] = base
  const used = new Set([rootPc])
  let prev = base
  const lo = base
  const hi = base + 4

  for (let s = baseString + 1; s < 6; s++) {
    let best = null
    let bestScore = Infinity
    for (let f = lo; f <= hi; f++) {
      const pc = (tuningMidi[s] + f) % 12
      if (!tones.has(pc)) continue
      const score = Math.abs(f - prev) + (used.has(pc) ? 1.6 : 0)
      if (score < bestScore) {
        bestScore = score
        best = f
      }
    }
    if (best != null) {
      frets[s] = best
      prev = best
      used.add((tuningMidi[s] + best) % 12)
    }
  }
  return frets
}

export function getTuning(id) {
  return TUNINGS.find((t) => t.id === id) || TUNINGS[0]
}

export function buildChord(tuningId, rootPc, quality) {
  const tuning = getTuning(tuningId)
  let frets
  if (tuningId === 'standard') {
    frets = OPEN[rootPc]?.[quality] || barreStandard(rootPc, quality)
  } else {
    frets = generatedVoicing(tuning.midi, rootPc, quality)
  }
  const midis = frets.map((f, s) => (f == null ? null : tuning.midi[s] + f))
  return {
    tuning,
    rootPc,
    quality,
    frets,
    midis,
    symbol: NOTE_NAMES[rootPc] + QUALITIES[quality].suffix,
    label: `${NOTE_NAMES[rootPc]} ${QUALITIES[quality].label}`,
  }
}

export function voicingText(chord) {
  return chord.frets.map((f) => (f == null ? 'x' : String(f))).join(' ')
}
