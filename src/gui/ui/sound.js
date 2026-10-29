// Ambient sound of the atmosphere, generated with Web Audio: no sound files.
// Every kind is a bed of colored noise in stereo that breathes at random, plus small events
// (drops, crackles, gusts, thunder) placed around the listener, all through a short room reverb.

/** @typedef {"rain" | "storm" | "fire" | "wind" | "hum"} Kind */

/** @type {AudioContext | null} */
let ctx = null;
/** @type {GainNode | null} */
let master = null;
/** Input of the room reverb. @type {GainNode | null} */
let room = null;
/** Nodes and timers of the playing sound, stopped together. */
let playing = { kind: "", stop: () => {} };
let volume = 0;
/** Stereo noise loops by color: white, pink (rain, fans), brown (rumble, fire). */
const buffers = {};

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    // Thunder and crackles must not clip.
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -10;
    limit.ratio.value = 6;
    master.connect(limit).connect(ctx.destination);
    room = ctx.createGain();
    room.gain.value = 0.35;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.2);
    room.connect(verb).connect(master);
  }
  return /** @type {AudioContext} */ (ctx);
}

/** A decaying noise tail: a small, soft room. */
function impulse(/** @type {AudioContext} */ a, /** @type {number} */ seconds) {
  const length = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(2, length, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  }
  return buf;
}

/** Moves a param to `value` over `seconds`, from wherever it is now. */
function ramp(/** @type {AudioParam} */ param, value, seconds) {
  const now = audio().currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

/** Four seconds of stereo noise of a color, looped by every source that uses it. */
function noise(/** @type {"white" | "pink" | "brown"} */ color = "white") {
  const a = audio();
  if (!buffers[color]) {
    const buf = a.createBuffer(2, a.sampleRate * 4, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, brown = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (color === "white") d[i] = w;
        else if (color === "pink") {
          // Paul Kellet's economy filter: -3 dB per octave.
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        } else {
          brown = (brown + 0.02 * w) / 1.02;
          d[i] = brown * 3.5;
        }
      }
    }
    buffers[color] = buf;
  }
  const src = a.createBufferSource();
  src.buffer = buffers[color];
  src.loop = true;
  // Start each source at a random point so layers do not line up.
  src.start(0, Math.random() * 4);
  return src;
}

/** Noise through a filter into a gain; returns the parts to shape and the source to stop. */
function bed(/** @type {"white" | "pink" | "brown"} */ color, /** @type {BiquadFilterType} */ type, freq, q, gain, /** @type {AudioNode} */ out) {
  const a = audio();
  const src = noise(color);
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(out);
  return { src, filter, g };
}

/** Moves a param to a new random value now and then, so a bed never sounds like a loop. */
function wander(/** @type {AudioParam} */ param, min, max, every, glide) {
  return repeat(() => param.setTargetAtTime(min + Math.random() * (max - min), audio().currentTime, glide), every * 0.5, every * 1.5);
}

/** A short burst of noise placed left or right: a raindrop, a crackle of wood. */
function tick(/** @type {AudioNode} */ out, freq, length, level, /** @type {"white" | "pink" | "brown"} */ color = "white", q = 3) {
  const a = audio();
  const t = a.currentTime + 0.005;
  const src = noise(color);
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const pan = a.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(g).connect(pan);
  pan.connect(out);
  pan.connect(/** @type {GainNode} */ (room));
  src.stop(t + length + 0.05);
}

/** Repeats `fn` at random intervals between `min` and `max` ms until stopped. */
function repeat(/** @type {() => void} */ fn, min, max) {
  let timer = 0;
  const go = () => {
    fn();
    timer = setTimeout(go, min + Math.random() * (max - min));
  };
  timer = setTimeout(go, min * Math.random());
  return () => clearTimeout(timer);
}

/** Builds one kind of sound into `out`. Returns a stop function. */
function build(/** @type {Kind} */ kind, /** @type {AudioNode} */ out) {
  const a = audio();
  /** @type {AudioScheduledSourceNode[]} */
  const sources = [];
  const timers = [];
  const r = Math.random;
  const layer = (/** @type {ReturnType<typeof bed>} */ b) => (sources.push(b.src), b);
  if (kind === "rain" || kind === "storm") {
    const heavy = kind === "storm";
    // The rain on the roof, its hiss on the glass, and the gutter.
    const roof = layer(bed("pink", "bandpass", heavy ? 1400 : 1800, 0.5, heavy ? 0.9 : 0.6, out));
    const hiss = layer(bed("white", "highpass", 6000, 0.4, heavy ? 0.08 : 0.05, out));
    layer(bed("brown", "lowpass", 300, 0.6, heavy ? 0.5 : 0.25, out));
    timers.push(wander(roof.g.gain, heavy ? 0.7 : 0.4, heavy ? 1.1 : 0.75, 5000, 2));
    timers.push(wander(hiss.filter.frequency, 4500, 7500, 4000, 1.5));
    // Drops on the sill and the glass, some close and loud.
    timers.push(repeat(() => tick(out, 1800 + r() * 4500, 0.015 + r() * 0.04, 0.08 + r() * (r() < 0.1 ? 0.5 : 0.18)), heavy ? 10 : 25, heavy ? 60 : 160));
    if (heavy) {
      const wind = layer(bed("pink", "bandpass", 380, 1.4, 0.3, out));
      timers.push(wander(wind.filter.frequency, 220, 700, 3500, 1.8));
      timers.push(wander(wind.g.gain, 0.1, 0.5, 4000, 1.5));
    }
  } else if (kind === "fire") {
    // The roar of the flames breathes; wood crackles in clusters and hisses now and then.
    const roar = layer(bed("brown", "lowpass", 380, 0.7, 0.7, out));
    timers.push(wander(roar.g.gain, 0.45, 0.95, 900, 0.3));
    timers.push(wander(roar.filter.frequency, 250, 520, 1200, 0.4));
    timers.push(repeat(() => {
      for (let i = 0, n = 1 + Math.floor(r() * 4); i < n; i++) {
        setTimeout(() => tick(out, 2500 + r() * 5000, 0.004 + r() * 0.02, 0.3 + r() * 0.6, "white", 1.2), i * (15 + r() * 60));
      }
    }, 90, 700));
    timers.push(repeat(() => tick(out, 180 + r() * 220, 0.3, 0.3, "brown", 1), 2500, 8000));
    const hiss = layer(bed("pink", "bandpass", 3200, 1.5, 0, out));
    timers.push(wander(hiss.g.gain, 0, 0.12, 3000, 0.8));
  } else if (kind === "wind") {
    // Two bodies of air and a whistle in a gap; gusts come at random.
    const low = layer(bed("pink", "bandpass", 420, 0.9, 0.6, out));
    const high = layer(bed("pink", "bandpass", 900, 1.6, 0.25, out));
    const whistle = layer(bed("white", "bandpass", 1300, 18, 0.08, out));
    timers.push(wander(low.filter.frequency, 250, 650, 3500, 1.6));
    timers.push(wander(low.g.gain, 0.4, 1.4, 3000, 1.2));
    timers.push(wander(high.filter.frequency, 700, 1500, 2500, 1));
    timers.push(wander(high.g.gain, 0.1, 0.6, 2500, 0.9));
    timers.push(wander(whistle.filter.frequency, 900, 1900, 2000, 0.8));
    timers.push(wander(whistle.g.gain, 0, 0.12, 4000, 1));
  } else if (kind === "hum") {
    // Mains hum with a slow beat, and a fan in a computer case.
    for (const [freq, level] of [[50, 0.1], [100.4, 0.045], [150, 0.02], [200.3, 0.008]]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = freq;
      g.gain.value = level;
      o.connect(g).connect(out);
      o.start();
      sources.push(o);
    }
    const fan = layer(bed("pink", "lowpass", 1100, 0.6, 0.25, out));
    layer(bed("white", "bandpass", 3200, 6, 0.015, out));
    timers.push(wander(fan.g.gain, 0.18, 0.3, 6000, 2));
    timers.push(repeat(() => tick(out, 900 + r() * 600, 0.03, 0.04, "white", 4), 4000, 15000));
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
    // A little of every bed goes to the room too.
    const send = a.createGain();
    send.gain.value = 0.25;
    out.connect(send).connect(/** @type {GainNode} */ (room));
    ramp(out.gain, 1, 2.5);
    const stop = build(kind, out);
    playing = { kind, stop: () => {
      ramp(out.gain, 0, 1.5);
      setTimeout(() => (stop(), out.disconnect(), send.disconnect()), 1700);
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

/** Thunder after a lightning flash: a crack when it is close, then a long roll that moves across. */
export function thunder() {
  if (!ctx || playing.kind !== "storm") return;
  const a = ctx;
  const near = Math.random() < 0.35;
  const t = a.currentTime + (near ? 0.15 : 0.6 + Math.random() * 1.8);
  const length = 4 + Math.random() * 3;
  const src = noise("brown");
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(near ? 1800 : 700, t);
  filter.frequency.exponentialRampToValueAtTime(70, t + length * 0.8);
  const pan = a.createStereoPanner();
  pan.pan.setValueAtTime(Math.random() - 0.5, t);
  pan.pan.linearRampToValueAtTime(Math.random() - 0.5, t + length);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(near ? 2.2 : 1.2, t + (near ? 0.03 : 0.25));
  // The roll swells once or twice before it fades.
  let at = t + 0.4;
  for (let i = 0; i < 2; i++, at += 0.5 + Math.random()) g.gain.exponentialRampToValueAtTime(0.5 + Math.random() * (near ? 1.4 : 0.8), at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(g).connect(pan);
  pan.connect(/** @type {GainNode} */ (master));
  pan.connect(/** @type {GainNode} */ (room));
  src.stop(t + length + 0.1);
  if (near) for (let i = 0; i < 6; i++) setTimeout(() => tick(/** @type {GainNode} */ (master), 2000 + Math.random() * 3000, 0.04, 0.6, "white", 0.8), (t - a.currentTime) * 1000 + i * 25);
}

// Quiet while the window is hidden.
document.addEventListener("visibilitychange", () => {
  if (!ctx || !master) return;
  ramp(master.gain, document.hidden ? 0 : volume, 0.5);
});
