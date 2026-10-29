// Ambient sound of the atmosphere, generated with Web Audio: no sound files.
// Every kind is filtered noise plus small random events (drops, crackles, gusts, thunder).

/** @typedef {"rain" | "storm" | "fire" | "wind" | "hum"} Kind */

/** @type {AudioContext | null} */
let ctx = null;
/** @type {GainNode | null} */
let master = null;
/** Nodes and timers of the playing sound, stopped together. */
let playing = { kind: "", stop: () => {} };
let volume = 0;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  return /** @type {AudioContext} */ (ctx);
}

/** Moves a gain to `value` over `seconds`, from wherever it is now. */
function ramp(/** @type {AudioParam} */ param, value, seconds) {
  const now = audio().currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

/** Two seconds of white noise, looped by every source. */
let noiseBuffer = null;
function noise() {
  const a = audio();
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  // Start each source at a random point so layers do not line up.
  src.start(0, Math.random() * 2);
  return src;
}

/** Noise through a filter into a gain; returns the gain to shape and the nodes to stop. */
function bed(/** @type {BiquadFilterType} */ type, freq, q, gain, /** @type {AudioNode} */ out) {
  const a = audio();
  const src = noise();
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(out);
  return { src, filter, g };
}

/** A short burst of noise: a raindrop, a crackle of wood. */
function tick(/** @type {AudioNode} */ out, freq, length, level) {
  const a = audio();
  const t = a.currentTime;
  const src = noise();
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 3;
  const g = a.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(g).connect(out);
  src.stop(t + length + 0.05);
}

/** Repeats `fn` at random intervals between `min` and `max` ms until stopped. */
function every(/** @type {() => void} */ fn, min, max) {
  let timer = 0;
  const go = () => {
    fn();
    timer = setTimeout(go, min + Math.random() * (max - min));
  };
  timer = setTimeout(go, min);
  return () => clearTimeout(timer);
}

/** Builds one kind of sound into `out`. Returns a stop function. */
function build(/** @type {Kind} */ kind, /** @type {AudioNode} */ out) {
  const a = audio();
  const sources = [];
  const timers = [];
  const r = Math.random;
  if (kind === "rain" || kind === "storm") {
    const heavy = kind === "storm";
    sources.push(bed("lowpass", heavy ? 2400 : 3200, 0.4, heavy ? 0.5 : 0.32, out).src);
    sources.push(bed("highpass", 5200, 0.5, heavy ? 0.12 : 0.07, out).src);
    // Drops on the sill and the glass.
    timers.push(every(() => tick(out, 2500 + r() * 3500, 0.02 + r() * 0.04, 0.12 + r() * 0.2), heavy ? 15 : 35, heavy ? 90 : 220));
    if (heavy) sources.push(bed("lowpass", 120, 0.7, 0.35, out).src);
  } else if (kind === "fire") {
    sources.push(bed("lowpass", 420, 0.6, 0.45, out).src);
    timers.push(every(() => tick(out, 1500 + r() * 3000, 0.01 + r() * 0.05, 0.2 + r() * 0.5), 40, 420));
    // Now and then a log settles.
    timers.push(every(() => tick(out, 300 + r() * 300, 0.25, 0.25), 3000, 9000));
  } else if (kind === "wind") {
    const w = bed("bandpass", 500, 1.2, 0.5, out);
    sources.push(w.src);
    const lfo = a.createOscillator();
    const depth = a.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = 320;
    lfo.connect(depth).connect(w.filter.frequency);
    lfo.start();
    sources.push(lfo);
    const swell = a.createOscillator();
    const swellDepth = a.createGain();
    swell.frequency.value = 0.11;
    swellDepth.gain.value = 0.25;
    swell.connect(swellDepth).connect(w.g.gain);
    swell.start();
    sources.push(swell);
  } else if (kind === "hum") {
    for (const [freq, level] of [[50, 0.12], [100, 0.05], [150, 0.02]]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = freq;
      g.gain.value = level;
      o.connect(g).connect(out);
      o.start();
      sources.push(o);
    }
    // A fan in a computer case.
    sources.push(bed("lowpass", 900, 0.5, 0.12, out).src);
  }
  return () => {
    timers.forEach((stop) => stop());
    sources.forEach((s) => s.stop());
  };
}

/**
 * Plays the sound of an atmosphere, fading over from what was playing. Null or a kind of "none" stops.
 * @param {{kind?: string, volume?: number} | null} sound
 * @param {number} level the reader's volume, 0 to 1
 */
export function play(sound, level) {
  const kind = sound?.kind && sound.kind !== "none" ? /** @type {Kind} */ (sound.kind) : null;
  volume = kind ? level * (sound.volume ?? 0.6) : 0;
  if (!kind) return fadeOut();
  const a = audio();
  if (a.state === "suspended") a.resume();
  if (playing.kind !== kind) {
    const old = playing;
    const out = a.createGain();
    out.gain.value = 0;
    out.connect(/** @type {GainNode} */ (master));
    ramp(out.gain, 1, 2);
    const stop = build(kind, out);
    playing = { kind, stop: () => {
      ramp(out.gain, 0, 1.5);
      setTimeout(() => (stop(), out.disconnect()), 1700);
    } };
    old.stop();
  }
  ramp(/** @type {GainNode} */ (master).gain, volume, 0.6);
}

function fadeOut() {
  playing.stop();
  playing = { kind: "", stop: () => {} };
}

export function stop() {
  volume = 0;
  fadeOut();
}

/** A roll of thunder some distance away, after a lightning flash. */
export function thunder() {
  if (!ctx || playing.kind !== "storm") return;
  const a = ctx;
  const delay = 0.4 + Math.random() * 1.6;
  const t = a.currentTime + delay;
  const src = noise();
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(90, t + 2.5);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1.6, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
  src.connect(filter).connect(g).connect(/** @type {GainNode} */ (master));
  src.stop(t + 4.6);
}

// Quiet while the window is hidden.
document.addEventListener("visibilitychange", () => {
  if (!ctx || !master) return;
  ramp(master.gain, document.hidden ? 0 : volume, 0.5);
});
