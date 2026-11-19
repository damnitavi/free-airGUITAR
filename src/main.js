import './style.css'
import { GuitarEngine } from './audio/engine.js'
import {
  TUNINGS,
  QUALITIES,
  QUALITY_BY_FINGERS,
  NOTE_NAMES,
  buildChord,
  noteName,
  midiToFreq,
  voicingText,
} from './audio/theory.js'
import { createTracker, readHand, makeProjector, HAND_BONES } from './vision/hands.js'

const $ = (id) => document.getElementById(id)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

const els = {
  canvas: $('view'),
  gate: $('gate'),
  startBtn: $('startBtn'),
  skipBtn: $('skipBtn'),
  gateNote: $('gateNote'),
  camPill: $('camPill'),
  fpsPill: $('fpsPill'),
  chordName: $('chordName'),
  chordSuffix: $('chordSuffix'),
  chordSub: $('chordSub'),
  diagram: $('diagram'),
  stringNotes: $('stringNotes'),
  lastNote: $('lastNote'),
  shapeLabel: $('shapeLabel'),
  fretCard: $('fretCard'),
  strumCard: $('strumCard'),
  fretState: $('fretState'),
  strumState: $('strumState'),
  fingers: $('fingers'),
  thumbDot: $('thumbDot'),
  fretVal: $('fretVal'),
  fretHint: $('fretHint'),
  strumVal: $('strumVal'),
  strumHint: $('strumHint'),
  strumMeter: $('strumMeter'),
  rail: $('rail'),
  railNote: $('railNote'),
  tuningChips: $('tuningChips'),
  vol: $('vol'),
  swapBtn: $('swapBtn'),
  guide: $('guide'),
  guideBody: $('guideBody'),
  guideClose: $('guideClose'),
  guideScrim: $('guideScrim'),
  guideBtn: $('guideBtn'),
  gateGuideBtn: $('gateGuideBtn'),
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const engine = new GuitarEngine()

const state = {
  tuningId: 'standard',
  rootPc: 0,
  quality: 'maj',
  muted: false,
  volume: 0.72,
  lefty: false,
  cameraOn: false,
  started: false,
}

let chord = buildChord(state.tuningId, state.rootPc, state.quality)
let guideOpen = false

/* ------------------------------------------------------------------ *
 * UI construction
 * ------------------------------------------------------------------ */

const railCells = []

NOTE_NAMES.forEach((name, i) => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'rail-cell'
  btn.textContent = name
  btn.addEventListener('click', () => setChord(i, state.quality))
  els.rail.appendChild(btn)
  railCells.push(btn)
})

TUNINGS.forEach((tuning) => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'chip'
  btn.textContent = tuning.name
  btn.title = tuning.label
  btn.dataset.id = tuning.id
  btn.addEventListener('click', () => {
    state.tuningId = tuning.id
    chord = buildChord(state.tuningId, state.rootPc, state.quality)
    renderChord()
    engine.prewarm(chord)
  })
  els.tuningChips.appendChild(btn)
})

function diagramSVG(c) {
  const frets = c.frets
  const positives = frets.filter((f) => f != null && f > 0)
  let base = 1
  if (positives.length) {
    const min = Math.min(...positives)
    base = min <= 1 ? 1 : min
  }
  const left = 24
  const top = 24
  const gapX = 23
  const gapY = 17
  const W = left + gapX * 5 + 14
  const H = top + gapY * 5 + 12
  const parts = []

  parts.push(
    `<rect x="${left - 6}" y="${top}" width="${gapX * 5 + 12}" height="${gapY * 5}" rx="4" fill="rgba(255,255,255,0.035)"/>`,
  )

  for (let k = 0; k <= 5; k++) {
    const y = top + gapY * k
    const first = k === 0 && base === 1
    parts.push(
      `<line x1="${left}" y1="${y}" x2="${left + gapX * 5}" y2="${y}" stroke="rgba(244,236,225,${
        first ? 0.8 : 0.22
      })" stroke-width="${first ? 3 : 1}"/>`,
    )
  }

  for (let i = 0; i < 6; i++) {
    const x = left + gapX * i
    parts.push(
      `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + gapY * 5}" stroke="rgba(244,236,225,0.24)" stroke-width="${
        (1.7 - i * 0.16).toFixed(2)
      }"/>`,
    )
  }

  if (base > 1) {
    for (let k = 0; k < 5; k++) {
      parts.push(
        `<text x="${left - 9}" y="${top + gapY * k + 12}" text-anchor="end" class="dnum">${base + k}</text>`,
      )
    }
  }

  for (let i = 0; i < 6; i++) {
    const x = left + gapX * i
    const f = frets[i]
    if (f == null) {
      parts.push(`<text x="${x}" y="${top - 8}" text-anchor="middle" class="dmute">×</text>`)
    } else if (f === 0) {
      parts.push(`<circle cx="${x}" cy="${top - 14}" r="3.4" fill="none" stroke="rgba(244,236,225,0.62)" stroke-width="1.3"/>`)
    }
  }

  for (let i = 0; i < 6; i++) {
    const f = frets[i]
    if (f == null || f === 0) continue
    const rel = f - base
    if (rel < 0 || rel > 4) continue
    const x = left + gapX * i
    const y = top + gapY * rel + gapY / 2
    parts.push(`<circle cx="${x}" cy="${y}" r="7" class="ddot"/>`)
    parts.push(`<text x="${x}" y="${y + 3.4}" text-anchor="middle" class="dtext">${f}</text>`)
  }

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.symbol} fret diagram">${parts.join('')}</svg>`
}

function renderChord() {
  const q = QUALITIES[chord.quality]
  els.chordName.textContent = NOTE_NAMES[chord.rootPc]
  els.chordSuffix.textContent = q.suffix
  els.chordSub.textContent = `${q.label} · ${chord.tuning.name.toLowerCase()}`
  els.shapeLabel.textContent = voicingText(chord)
  els.diagram.innerHTML = diagramSVG(chord)
  els.stringNotes.innerHTML = chord.midis
    .map(
      (m, i) =>
        `<div class="sn${m == null ? ' off' : ''}"><b>${m == null ? '×' : NOTE_NAMES[m % 12]}</b><span>${
          NOTE_NAMES[chord.tuning.midi[i] % 12]
        }</span></div>`,
    )
    .join('')
  railCells.forEach((cell, i) => cell.classList.toggle('on', i === chord.rootPc))
  els.railNote.textContent = `${NOTE_NAMES[chord.rootPc]}${q.suffix}`
  els.tuningChips.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('on', chip.dataset.id === chord.tuning.id)
  })
}

function setChord(rootPc, quality) {
  if (rootPc === state.rootPc && quality === state.quality) return
  state.rootPc = rootPc
  state.quality = quality
  chord = buildChord(state.tuningId, rootPc, quality)
  renderChord()
  engine.prewarm(chord)
}

/* ------------------------------------------------------------------ *
 * Camera + tracking
 * ------------------------------------------------------------------ */

const view = { w: 1, h: 1, dpr: 1 }
const g2d = els.canvas.getContext('2d')

let video = null
let stream = null
let tracker = null
let lastFrameTs = 0

function resize() {
  const rect = els.canvas.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  view.w = Math.max(1, rect.width)
  view.h = Math.max(1, rect.height)
  view.dpr = dpr
  els.canvas.width = Math.round(view.w * dpr)
  els.canvas.height = Math.round(view.h * dpr)
}

function setCamState(kind, text) {
  els.camPill.dataset.state = kind
  els.camPill.querySelector('span').textContent = text
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera API')
  if (!video) {
    video = document.createElement('video')
    video.playsInline = true
    video.muted = true
    video.autoplay = true
    video.setAttribute('playsinline', '')
  }
  setCamState('wait', 'starting camera')
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  setCamState('wait', 'loading hand model')
  if (!tracker) tracker = await createTracker()
  state.cameraOn = true
  setCamState('on', 'tracking hands')
}

/* ------------------------------------------------------------------ *
 * Gestures
 * ------------------------------------------------------------------ */

const hands = { fret: null, strum: null }
const strumTrail = []
const strumState = { y: null, t: 0, vy: 0, travel: 0, last: 0, pinched: false }
let muteSince = 0
let lastFretSeen = 0
let flashTimer = 0

const stab = {
  root: { value: state.rootPc, pending: null, since: 0 },
  quality: { value: state.quality, pending: null, since: 0 },
}

function stabilize(slot, value, now, ms) {
  if (value === slot.value) {
    slot.pending = null
    return slot.value
  }
  if (!slot.pending || slot.pending.value !== value) {
    slot.pending = { value, since: now }
    return slot.value
  }
  if (now - slot.pending.since >= ms) {
    slot.value = value
    slot.pending = null
  }
  return slot.value
}

function flashStrings() {
  els.stringNotes.classList.add('ring')
  els.chordName.classList.remove('pulse')
  void els.chordName.offsetWidth
  els.chordName.classList.add('pulse')
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    els.stringNotes.classList.remove('ring')
    els.chordName.classList.remove('pulse')
  }, 300)
}

function doStrum(direction, velocity) {
  if (!engine.ready) return
  if (state.muted) {
    engine.mute(velocity)
    els.lastNote.textContent = 'palm mute'
    return
  }
  const res = engine.strum(chord, { direction, velocity })
  if (!res) return
  els.lastNote.textContent = `${res.count} strings · ${direction}stroke`
  flashStrings()
}

function doPick(hand) {
  if (!engine.ready) return
  const t = clamp((hand.ny - 0.16) / 0.68, 0, 0.999)
  let idx = 5 - Math.floor(t * 6)
  if (chord.midis[idx] == null) {
    let best = -1
    let bestDist = 99
    chord.midis.forEach((m, i) => {
      if (m == null) return
      const d = Math.abs(i - idx)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    if (best < 0) return
    idx = best
  }
  const midi = chord.midis[idx]
  if (!engine.pick(midi, 0.85)) return
  els.lastNote.textContent = `${noteName(midi)} · ${midiToFreq(midi).toFixed(1)} Hz`
  flashStrings()
}

function applyFretHand(hand, now) {
  lastFretSeen = now
  const rootIdx = clamp(Math.floor(hand.nx * 12), 0, 11)
  const root = stabilize(stab.root, rootIdx, now, 90)
  const mapped = QUALITY_BY_FINGERS[clamp(hand.extended, 0, 5)]

  let quality = stab.quality.value
  if (mapped == null) {
    if (!muteSince) muteSince = now
    state.muted = now - muteSince > 110
    stab.quality.pending = null
  } else {
    muteSince = 0
    state.muted = false
    quality = stabilize(stab.quality, mapped, now, 120)
  }
  setChord(root, quality)
}

function applyStrumHand(hand, now) {
  const s = strumState
  if (guideOpen) {
    s.y = null
    s.vy = 0
    s.pinched = false
    return
  }
  if (!hand) {
    s.y = null
    s.vy = 0
    s.travel = 0
    s.pinched = false
    return
  }

  strumTrail.push({ x: hand.x, y: hand.y, t: now })
  if (strumTrail.length > 48) strumTrail.shift()

  if (s.y == null) {
    s.y = hand.ny
    s.t = now
    s.travel = 0
  } else {
    const dt = Math.max(0.012, (now - s.t) / 1000)
    const dy = hand.ny - s.y
    s.vy = s.vy * 0.5 + (dy / dt) * 0.5
    s.travel += Math.abs(dy)
    s.y = hand.ny
    s.t = now

    const speed = Math.abs(s.vy)
    if (now - s.last > 130 && speed > 1.1 && s.travel > 0.03) {
      doStrum(s.vy > 0 ? 'down' : 'up', clamp(0.34 + (speed - 1.1) / 2.4, 0.34, 1))
      s.last = now
      s.travel = 0
    }
  }

  if (hand.pinching && !s.pinched) doPick(hand)
  s.pinched = hand.pinching
}

function pollCamera(now) {
  if (!state.cameraOn || !tracker || !video || video.readyState < 2) {
    hands.fret = null
    hands.strum = null
    return
  }
  const ts = Math.max(now, lastFrameTs + 1)
  lastFrameTs = ts

  let result
  try {
    result = tracker.detectForVideo(video, ts)
  } catch {
    return
  }

  const project = makeProjector(view, video)
  const found = []
  if (result?.landmarks) {
    for (const lm of result.landmarks) found.push(readHand(lm, project))
  }
  found.sort((a, b) => a.nx - b.nx)

  let fretHand = null
  let strumHand = null
  if (found.length >= 2) {
    fretHand = state.lefty ? found[1] : found[0]
    strumHand = state.lefty ? found[0] : found[1]
  } else if (found.length === 1) {
    const h = found[0]
    const asFret = state.lefty ? h.nx > 0.55 : h.nx < 0.45
    if (asFret) fretHand = h
    else strumHand = h
  }

  hands.fret = fretHand
  hands.strum = strumHand

  if (fretHand) applyFretHand(fretHand, now)
  else if (state.muted || muteSince) {
    state.muted = false
    muteSince = 0
  }

  applyStrumHand(strumHand, now)
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

function drawSkeleton(hand, color) {
  const pts = hand.pts
  g2d.save()
  g2d.lineCap = 'round'
  g2d.strokeStyle = color
  g2d.shadowColor = color
  g2d.shadowBlur = 12
  g2d.globalAlpha = 0.42
  g2d.lineWidth = 2.4
  for (const [a, b] of HAND_BONES) {
    g2d.beginPath()
    g2d.moveTo(pts[a][0], pts[a][1])
    g2d.lineTo(pts[b][0], pts[b][1])
    g2d.stroke()
  }
  g2d.globalAlpha = 0.92
  for (let i = 0; i < pts.length; i++) {
    const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20
    g2d.beginPath()
    g2d.arc(pts[i][0], pts[i][1], tip ? 3.6 : 2.1, 0, Math.PI * 2)
    g2d.fillStyle = color
    g2d.fill()
  }
  g2d.restore()
}

function drawTrail(now) {
  g2d.save()
  g2d.lineCap = 'round'
  for (let i = 1; i < strumTrail.length; i++) {
    const a = strumTrail[i - 1]
    const b = strumTrail[i]
    const age = (now - b.t) / 640
    if (age < 0 || age > 1) continue
    g2d.globalAlpha = (1 - age) * 0.45
    g2d.strokeStyle = '#6fd8c9'
    g2d.lineWidth = 1.5 + (1 - age) * 5
    g2d.beginPath()
    g2d.moveTo(a.x, a.y)
    g2d.lineTo(b.x, b.y)
    g2d.stroke()
  }
  g2d.restore()
}

function draw(now) {
  g2d.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
  g2d.clearRect(0, 0, view.w, view.h)

  let drewVideo = false
  if (state.cameraOn && video && video.readyState >= 2 && video.videoWidth) {
    const scale = Math.max(view.w / video.videoWidth, view.h / video.videoHeight)
    const dw = video.videoWidth * scale
    const dh = video.videoHeight * scale
    const ox = (view.w - dw) / 2
    const oy = (view.h - dh) / 2
    g2d.save()
    g2d.translate(view.w, 0)
    g2d.scale(-1, 1)
    g2d.globalAlpha = 0.9
    g2d.drawImage(video, ox, oy, dw, dh)
    g2d.restore()
    g2d.fillStyle = 'rgba(9, 10, 13, 0.22)'
    g2d.fillRect(0, 0, view.w, view.h)
    drewVideo = true
  }

  if (!drewVideo) {
    const grad = g2d.createRadialGradient(
      view.w * 0.5,
      view.h * 0.4,
      0,
      view.w * 0.5,
      view.h * 0.4,
      Math.max(view.w, view.h) * 0.85,
    )
    grad.addColorStop(0, '#1b1713')
    grad.addColorStop(1, '#08090b')
    g2d.fillStyle = grad
    g2d.fillRect(0, 0, view.w, view.h)
  }

  drawTrail(now)
  if (hands.fret) drawSkeleton(hands.fret, '#eda94b')
  if (hands.strum) drawSkeleton(hands.strum, '#6fd8c9')
}

/* ------------------------------------------------------------------ *
 * HUD refresh
 * ------------------------------------------------------------------ */

let lastPaint = 0

function paintHands(now) {
  if (now - lastPaint < 90) return
  lastPaint = now
  const f = hands.fret
  const s = hands.strum

  els.fretCard.classList.toggle('live', !!f)
  els.strumCard.classList.toggle('live', !!s)
  els.fretState.textContent = f ? 'tracking' : 'no hand'
  els.strumState.textContent = s ? 'tracking' : 'no hand'

  els.fingers.querySelectorAll('i.f').forEach((dot, i) => dot.classList.toggle('on', !!f && !!f.fingers[i]))
  els.thumbDot.classList.toggle('on', !!f && f.thumbOut)

  els.fretVal.textContent = f ? f.label : '—'
  els.fretHint.textContent = f
    ? state.muted
      ? 'palm mute'
      : QUALITIES[stab.quality.value].label
    : 'show your left hand'

  els.strumMeter.style.transform = `scaleX(${clamp(Math.abs(strumState.vy) / 3, 0, 1).toFixed(3)})`
  els.strumVal.textContent = s
    ? strumState.vy > 0.35
      ? 'down'
      : strumState.vy < -0.35
        ? 'up'
        : 'still'
    : '—'
  els.strumHint.textContent = s ? 'pinch to pick' : 'swipe up / down'
}

let fpsFrames = 0
let fpsSince = 0

function paintFps(now) {
  fpsFrames++
  if (!fpsSince) fpsSince = now
  if (now - fpsSince >= 500) {
    els.fpsPill.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsSince))} fps`
    fpsFrames = 0
    fpsSince = now
  }
}

function loop(now) {
  requestAnimationFrame(loop)
  pollCamera(now)
  draw(now)
  paintHands(now)
  paintFps(now)
  if (!hands.fret && state.muted && now - lastFretSeen > 400) state.muted = false
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

els.vol.addEventListener('input', () => {
  state.volume = Number(els.vol.value) / 100
  engine.setVolume(state.volume)
})

els.swapBtn.addEventListener('click', () => {
  state.lefty = !state.lefty
  els.swapBtn.classList.toggle('on', state.lefty)
  els.swapBtn.textContent = state.lefty ? 'left-handed' : 'swap hands'
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && guideOpen) {
    closeGuide()
    return
  }
  if (!state.started) return
  if (e.key === 'g' || e.key === 'G' || e.key === '?') {
    if (guideOpen) closeGuide()
    else openGuide()
    return
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    const dir = e.key === 'ArrowLeft' ? -1 : 1
    setChord((state.rootPc + dir + 12) % 12, state.quality)
  } else if (e.code === 'Space') {
    e.preventDefault()
    doStrum('down', 0.8)
  } else if (e.key === 'p' || e.key === 'P') {
    doPick({ ny: 0.5 })
  } else if (e.key >= '1' && e.key <= '5') {
    const list = ['5', 'maj', 'min', '7', 'maj7']
    setChord(state.rootPc, list[Number(e.key) - 1])
  } else if (e.key === '0') {
    state.muted = true
    els.lastNote.textContent = 'palm mute'
  }
})

window.addEventListener('keyup', (e) => {
  if (e.key === '0') state.muted = false
})

/* ------------------------------------------------------------------ *
 * Gesture guide
 * ------------------------------------------------------------------ */

const GUIDE_ROWS = [
  { quality: null, name: 'Closed fist', sub: 'strings damped', fingers: 0, thumb: false },
  { quality: '5', name: 'One finger', sub: 'power chord', fingers: 1, thumb: true },
  { quality: 'maj', name: 'Two fingers', sub: 'major', fingers: 2, thumb: true },
  { quality: 'min', name: 'Three fingers', sub: 'minor', fingers: 3, thumb: true },
  { quality: '7', name: 'Four fingers', sub: 'dominant 7th', fingers: 4, thumb: true },
  { quality: 'maj7', name: 'Four fingers + thumb tucked', sub: 'major 7th', fingers: 4, thumb: false },
]

function poseHTML(fingers, thumb) {
  const dots = [0, 1, 2, 3].map((i) => `<i class="f${i < fingers ? ' on' : ''}"></i>`).join('')
  return `<span class="pose"><i class="t${thumb ? ' on' : ''}"></i>${dots}</span>`
}

function tonesOf(rootPc, quality) {
  const seen = new Set()
  const names = []
  for (const step of QUALITIES[quality].intervals) {
    const pc = (rootPc + step) % 12
    if (seen.has(pc)) continue
    seen.add(pc)
    names.push(NOTE_NAMES[pc])
  }
  return names.join(' · ')
}

function renderGuide() {
  const root = NOTE_NAMES[state.rootPc]

  const qualityRows = GUIDE_ROWS.map((row) => {
    const symbol = row.quality ? root + QUALITIES[row.quality].suffix : '—'
    const detail = row.quality ? tonesOf(state.rootPc, row.quality) : 'nothing rings'
    return `<button class="grow" type="button" data-quality="${row.quality || 'mute'}">
      ${poseHTML(row.fingers, row.thumb)}
      <span class="gtext"><b>${row.name}</b><em>${row.sub}</em></span>
      <span class="gchord">${symbol}<em>${detail}</em></span>
    </button>`
  }).join('')

  const noteChips = NOTE_NAMES.map(
    (name, i) => `<span class="gnote${i === state.rootPc ? ' on' : ''}">${name}</span>`,
  ).join('')

  const tuningList = TUNINGS.map(
    (t) => `<span class="gtune"><b>${t.name}</b><em>${t.label}</em></span>`,
  ).join('')

  els.guideBody.innerHTML = `
    <section class="gsection">
      <h3>1 · Fretting hand sets the chord type<span>the hand hovering on the left</span></h3>
      <div class="glist">${qualityRows}</div>
    </section>
    <section class="gsection">
      <h3>2 · Fretting hand sets the root<span>slide left ↔ right across the neck</span></h3>
      <div class="gnotes">${noteChips}</div>
      <p class="ghint">The strip along the bottom of the screen matches these twelve notes — the highlighted one is sounding now.</p>
    </section>
    <section class="gsection">
      <h3>3 · Strum hand makes the sound<span>the hand on the right</span></h3>
      <div class="glist">
        <button class="grow" type="button" data-strum="down">
          <span class="pose glyph">↓</span>
          <span class="gtext"><b>Swipe down</b><em>low strings to high</em></span>
          <span class="gchord">downstroke<em>full chord</em></span>
        </button>
        <button class="grow" type="button" data-strum="up">
          <span class="pose glyph">↑</span>
          <span class="gtext"><b>Swipe up</b><em>top four strings</em></span>
          <span class="gchord">upstroke<em>lighter</em></span>
        </button>
        <button class="grow" type="button" data-pick="1">
          <span class="pose glyph">✥</span>
          <span class="gtext"><b>Pinch thumb + index</b><em>height picks the string</em></span>
          <span class="gchord">single note<em>one string</em></span>
        </button>
      </div>
      <p class="ghint">Faster swipes ring louder and brighter. A closed fist on the fretting hand turns every stroke into a palm-muted thud.</p>
    </section>
    <section class="gsection">
      <h3>4 · Tunings<span>the strings are re-tuned and the chords re-voiced</span></h3>
      <div class="gtunes">${tuningList}</div>
    </section>
    <section class="gsection">
      <h3>5 · Keyboard &amp; mouse<span>optional — your hands are enough</span></h3>
      <div class="gkeys">
        <div><kbd>←</kbd><kbd>→</kbd><span>root</span></div>
        <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd><kbd>5</kbd><span>power · major · minor · 7th · maj7</span></div>
        <div><kbd>space</kbd><span>strum</span></div>
        <div><kbd>P</kbd><span>pick a string</span></div>
        <div><kbd>G</kbd><span>open or close this guide</span></div>
      </div>
    </section>
  `

  els.guideBody.querySelectorAll('.grow').forEach((row) => {
    row.addEventListener('click', () => {
      if (!engine.ready) return
      const quality = row.dataset.quality
      if (quality === 'mute') {
        engine.mute(0.8)
        els.lastNote.textContent = 'palm mute'
        return
      }
      if (quality) {
        const preview = buildChord(state.tuningId, state.rootPc, quality)
        engine.prewarm(preview)
        engine.strum(preview, { direction: 'down', velocity: 0.85 })
        els.lastNote.textContent = `${preview.symbol} · guide preview`
        return
      }
      if (row.dataset.strum) {
        engine.strum(chord, { direction: row.dataset.strum, velocity: 0.85 })
        els.lastNote.textContent = `${row.dataset.strum}stroke · guide preview`
        return
      }
      if (row.dataset.pick) {
        const midi = chord.midis.slice().reverse().find((m) => m != null)
        if (midi != null) {
          engine.pick(midi, 0.9)
          els.lastNote.textContent = `${noteName(midi)} · ${midiToFreq(midi).toFixed(1)} Hz`
        }
      }
    })
  })
}

function openGuide() {
  renderGuide()
  guideOpen = true
  els.guide.classList.add('open')
  els.guide.setAttribute('aria-hidden', 'false')
}

function closeGuide() {
  guideOpen = false
  els.guide.classList.remove('open')
  els.guide.setAttribute('aria-hidden', 'true')
}

els.guideBtn.addEventListener('click', openGuide)
els.gateGuideBtn.addEventListener('click', openGuide)
els.guideClose.addEventListener('click', closeGuide)
els.guideScrim.addEventListener('click', closeGuide)

async function begin(withCamera) {
  if (state.started) return
  state.started = true
  els.startBtn.disabled = true
  els.startBtn.textContent = 'Starting…'

  try {
    await engine.ensure()
    engine.setVolume(state.volume)
  } catch (err) {
    state.started = false
    els.startBtn.disabled = false
    els.startBtn.textContent = 'Enable camera & sound'
    els.gateNote.textContent = `Audio could not start (${err.message || err}). Click once more.`
    return
  }

  if (withCamera) {
    try {
      await startCamera()
    } catch (err) {
      state.started = false
      state.cameraOn = false
      setCamState('off', 'camera blocked')
      els.startBtn.disabled = false
      els.startBtn.textContent = 'Retry camera'
      els.gateNote.textContent = `Camera unavailable — ${
        err.message || 'permission denied'
      }. Keyboard works too: ← → root, 1–5 chord type, space strums, P picks a string.`
      return
    }
  } else {
    setCamState('off', 'no camera')
    els.gateNote.textContent = 'Keyboard: ← → root, 1–5 chord type, space strums, P picks a string.'
  }

  els.gate.classList.add('hide')
  renderChord()
  engine.prewarm(chord)
}

els.startBtn.addEventListener('click', () => begin(true))
els.skipBtn.addEventListener('click', () => begin(false))

window.addEventListener('resize', resize)
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(els.canvas)

resize()
renderChord()
requestAnimationFrame(loop)
