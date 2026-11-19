import { midiToFreq } from './theory.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/* ------------------------------------------------------------------ *
 * Biquad helpers (used offline, per rendered string)
 * ------------------------------------------------------------------ */

function peakCoeffs(sr, f, gainDb, q) {
  const A = Math.pow(10, gainDb / 40)
  const w = (2 * Math.PI * f) / sr
  const alpha = Math.sin(w) / (2 * q)
  const cw = Math.cos(w)
  const a0 = 1 + alpha / A
  return [
    (1 + alpha * A) / a0,
    (-2 * cw) / a0,
    (1 - alpha * A) / a0,
    (-2 * cw) / a0,
    (1 - alpha / A) / a0,
  ]
}

function highpassCoeffs(sr, f, q) {
  const w = (2 * Math.PI * f) / sr
  const alpha = Math.sin(w) / (2 * q)
  const cw = Math.cos(w)
  const a0 = 1 + alpha
  return [
    ((1 + cw) / 2) / a0,
    (-(1 + cw)) / a0,
    ((1 + cw) / 2) / a0,
    (-2 * cw) / a0,
    (1 - alpha) / a0,
  ]
}

function lowpassCoeffs(sr, f, q) {
  const w = (2 * Math.PI * f) / sr
  const alpha = Math.sin(w) / (2 * q)
  const cw = Math.cos(w)
  const a0 = 1 + alpha
  return [
    ((1 - cw) / 2) / a0,
    (1 - cw) / a0,
    ((1 - cw) / 2) / a0,
    (-2 * cw) / a0,
    (1 - alpha) / a0,
  ]
}

function applyBiquad(buf, c) {
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i]
    const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    buf[i] = y
  }
}

/* ------------------------------------------------------------------ *
 * A plucked string: Karplus-Strong with a noisy plectrum excitation,
 * comb-filtered pluck position, frequency-dependent damping and an
 * acoustic body EQ curve. Rendered once per pitch, then cached.
 * ------------------------------------------------------------------ */

export function renderPluck(midi, sr) {
  const freq = midiToFreq(midi)
  const t60 = clamp(5.6 - (midi - 40) * 0.115, 1.1, 5.6)
  const dur = Math.min(2.8, t60 * 0.9)
  const total = Math.max(64, Math.floor(dur * sr))
  const N = Math.max(6, Math.round(sr / freq - 0.5))
  const bright = clamp(0.9 - (midi - 40) * 0.016, 0.12, 0.9)

  // plectrum burst: lowpassed noise, brighter on the treble strings
  const noise = new Float32Array(N)
  const a = 0.16 + 0.74 * bright
  let lp = 0
  for (let i = 0; i < N; i++) {
    lp += (Math.random() * 2 - 1 - lp) * a
    noise[i] = lp
  }

  // pluck position comb: plucking near the bridge brightens the tone
  const pluck = Math.max(1, Math.round(N * 0.14))
  const delay = new Float32Array(N)
  for (let i = 0; i < N; i++) delay[i] = noise[i] - 0.9 * noise[(i + pluck) % N]

  let peak = 1e-6
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(delay[i]))
  const exc = 0.9 / peak
  for (let i = 0; i < N; i++) delay[i] *= exc

  const out = new Float32Array(total)
  const g = Math.pow(0.001, 1 / (t60 * freq))
  let idx = 0
  let prev = 0
  for (let n = 0; n < total; n++) {
    const s = delay[idx]
    out[n] = s
    delay[idx] = g * (0.5 * s + 0.5 * prev)
    prev = s
    if (++idx >= N) idx = 0
  }

  // body: air, top-plate and bridge resonances of a dreadnought
  applyBiquad(out, highpassCoeffs(sr, 62, 0.7))
  applyBiquad(out, peakCoeffs(sr, 100, 2.6, 1.1))
  applyBiquad(out, peakCoeffs(sr, 198, 3.2, 2.4))
  applyBiquad(out, peakCoeffs(sr, 430, 1.8, 1.7))
  applyBiquad(out, peakCoeffs(sr, 1180, -1.6, 1.3))
  applyBiquad(out, peakCoeffs(sr, 2700, 2.4, 1.4))
  applyBiquad(out, lowpassCoeffs(sr, 7600, 0.8))

  // soft saturation + fade out so the buffer never clicks
  let maxv = 1e-6
  for (let i = 0; i < total; i++) {
    out[i] = Math.tanh(out[i] * 1.1)
    maxv = Math.max(maxv, Math.abs(out[i]))
  }
  const norm = 0.9 / maxv
  const fade = Math.floor(sr * 0.04)
  for (let i = 0; i < total; i++) {
    const tail = i > total - fade ? (total - i) / fade : 1
    out[i] *= norm * tail
  }
  return out
}

function makeImpulse(ctx, seconds) {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    let smoothed = 0
    for (let i = 0; i < len; i++) {
      const t = i / sr
      const decay = Math.exp(-t * 3.4)
      const n = Math.random() * 2 - 1
      smoothed += (n - smoothed) * 0.24
      data[i] = smoothed * decay * (i < sr * 0.012 ? i / (sr * 0.012) : 1) * 0.55
    }
  }
  return buf
}

function makeThump() {
  const sr = 44100
  const len = Math.floor(sr * 0.18)
  const data = new Float32Array(len)
  let lp = 0
  for (let i = 0; i < len; i++) {
    const t = i / sr
    lp += (Math.random() * 2 - 1 - lp) * 0.045
    data[i] = lp * Math.exp(-t * 26) * 2.2
  }
  return data
}

function softClipCurve() {
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * 1.5)
  }
  return curve
}

export class GuitarEngine {
  constructor() {
    this.ctx = null
    this.cache = new Map()
    this.volume = 0.72
    this.thump = null
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  async ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx({ latencyHint: 'interactive' })
      this.ctx = ctx

      this.input = ctx.createGain()
      this.input.gain.value = 1

      this.dry = ctx.createGain()
      this.dry.gain.value = 0.92

      this.wet = ctx.createGain()
      this.wet.gain.value = 0.24

      this.conv = ctx.createConvolver()
      this.conv.buffer = makeImpulse(ctx, 1.7)

      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.knee.value = 20
      comp.ratio.value = 3.4
      comp.attack.value = 0.004
      comp.release.value = 0.22

      const shaper = ctx.createWaveShaper()
      shaper.curve = softClipCurve()
      shaper.oversample = '2x'

      this.master = ctx.createGain()
      this.master.gain.value = this.volume

      this.input.connect(this.dry).connect(comp)
      this.input.connect(this.conv).connect(this.wet).connect(comp)
      comp.connect(shaper).connect(this.master).connect(ctx.destination)
    }
    if (this.ctx.state !== 'running') await this.ctx.resume()
    return this.ctx
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1)
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03)
  }

  bufferFor(midi) {
    const key = String(midi)
    const hit = this.cache.get(key)
    if (hit) {
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit
    }
    const data = renderPluck(midi, this.ctx.sampleRate)
    const buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate)
    buf.copyToChannel(data, 0)
    this.cache.set(key, buf)
    if (this.cache.size > 26) this.cache.delete(this.cache.keys().next().value)
    return buf
  }

  note(midi, when, vel = 0.8, pan = 0) {
    if (!this.ctx) return
    const ctx = this.ctx
    const buf = this.bufferFor(midi)
    const src = ctx.createBufferSource()
    src.buffer = buf

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900 + 5600 * vel
    filter.Q.value = 0.6

    const gain = ctx.createGain()
    gain.gain.value = 0.5 + 0.45 * vel

    let tail = filter
    src.connect(filter)
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner()
      p.pan.value = clamp(pan, -1, 1)
      filter.connect(p)
      tail = p
    }
    tail.connect(gain).connect(this.input)
    src.start(when, 0)
    src.stop(when + buf.duration + 0.05)
  }

  strum(chord, { direction = 'down', velocity = 0.7 } = {}) {
    if (!this.ctx) return null
    const t0 = this.ctx.currentTime + 0.015
    const order = direction === 'up' ? [5, 4, 3, 2] : [0, 1, 2, 3, 4, 5]
    const spread = direction === 'up' ? 0.014 : 0.021
    const step = spread * (1.3 - velocity * 0.6)
    let i = 0
    for (const s of order) {
      const midi = chord.midis[s]
      if (midi == null) continue
      this.note(midi, t0 + i * step, 0.55 + 0.42 * velocity, ((s - 2.5) / 5) * 0.5)
      i++
    }
    return { at: t0, count: i, step, direction }
  }

  pick(midi, velocity = 0.8) {
    if (!this.ctx || midi == null) return null
    const when = this.ctx.currentTime + 0.012
    this.note(midi, when, 0.6 + 0.4 * velocity, 0)
    return { at: when }
  }

  mute(velocity = 0.6) {
    if (!this.ctx) return null
    if (!this.thump) {
      const data = makeThump()
      this.thump = this.ctx.createBuffer(1, data.length, 44100)
      this.thump.copyToChannel(data, 0)
    }
    const src = this.ctx.createBufferSource()
    src.buffer = this.thump
    src.playbackRate.value = 0.9 + Math.random() * 0.2
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420 + 700 * velocity
    const gain = this.ctx.createGain()
    gain.gain.value = 0.5 + 0.5 * velocity
    src.connect(filter).connect(gain).connect(this.input)
    const when = this.ctx.currentTime + 0.008
    src.start(when)
    return { at: when }
  }

  /** Render the strings of a chord in idle slices so the first strum is instant. */
  prewarm(chord) {
    if (!this.ctx) return
    const midis = chord.midis.filter((m) => m != null)
    const run = (i) => {
      if (!this.ctx || i >= midis.length) return
      if (!this.cache.has(String(midis[i]))) {
        try {
          this.bufferFor(midis[i])
        } catch {
          return
        }
      }
      setTimeout(() => run(i + 1), 24)
    }
    setTimeout(() => run(0), 30)
  }
}
