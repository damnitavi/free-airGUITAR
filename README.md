# Aerofret

An air guitar you play with both hands in front of your webcam.

- **Fretting hand** (left) — slide horizontally through the 12 roots; the number of
  extended fingers picks the chord type: 1 = power chord, 2 = major, 3 = minor,
  4 = dominant 7th, closed fist = palm mute.
- **Strum hand** (right) — swipe down or up to strum; pinch thumb + index to pick
  a single string. The hand's height chooses which string.
- The HUD shows the chord symbol, the fret diagram, every string's note and the
  frequency of the last plucked note.

Sound is synthesised in the browser with no samples: every string is a
Karplus–Strong delay line with a filtered plectrum burst, pluck-position comb,
frequency-dependent damping and an acoustic-body EQ curve, then sent through a
room reverb and a soft limiter. Tunings (standard, drop D, half step down,
DADGAD, open G) retune the strings and re-voice the chords.

Hand tracking runs locally with MediaPipe's hand landmarker; video never leaves
the machine. Keyboard fallback: `←` `→` root, `1`–`5` chord type, `space` strum,
`P` pick.

## Run locally

```sh
npm install
npm run dev
```

Open the URL printed by Vite (`http://127.0.0.1:5199/` if you start it with
`--port 5199`). Camera access needs `localhost` or a secure origin.

## Build

```sh
npm run build
```

The build produces `dist/`. `deploy.json` and `worker/index.js` serve it through
the platform `ASSETS` binding, so the site can be published with `sites_deploy`.

## Layout

- `src/main.js` — camera loop, gesture mapping, HUD.
- `src/vision/hands.js` — MediaPipe wrapper and landmark → gesture reader.
- `src/audio/theory.js` — tunings, chord qualities and voicing generation.
- `src/audio/engine.js` — string synthesis, strums, mute, reverb.
- `public/mediapipe/wasm` and `public/models` — the local hand-tracking runtime.
