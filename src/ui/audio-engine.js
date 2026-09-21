// Web Audio API Procedural Synthesizer for Gunny
// Generates low-latency, asset-free tactile game audio:
// - Cannon punch & shell release
// - Shell flight whistle
// - Deep sub-bass crater detonation rumble
// - Metallic critical hit chime
// - Wind sweep on turn transition
// - Urgent heartbeat tick for turn countdown (<3s)

export class AudioEngine {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.ctx = null;
    this.masterGain = null;
    this.lastTickTime = 0;
  }

  // Lazy initialization on first user gesture (satisfies browser autoplay policy)
  init() {
    if (this.ctx) return;
    const AudioCtx = (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) ||
                     (typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext));
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.enabled = !muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.enabled ? 0.35 : 0, this.ctx.currentTime);
    }
  }

  toggle() {
    this.setMuted(this.enabled);
    return this.enabled;
  }

  // 1. Cannon blast / launch punch
  playShoot(shotType = "s1") {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // Frequency sweep: punchy kick down to sub
    const startFreq = shotType === "ss" ? 320 : 240;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);

    // Low pass filter
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.18);

    // Gain envelope
    const vol = shotType === "ss" ? 1.0 : 0.7;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.22);

    // Add noise puff for muzzle flash
    this.playNoise({ duration: 0.08, volume: 0.4, cutoff: 1200 });
  }

  // Helper: white noise burst with filter envelope
  playNoise({ duration = 0.1, volume = 0.3, cutoff = 800 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + duration);
  }

  // 2. Shell flight whistle
  playWhistle() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(580, t);
    osc.frequency.linearRampToValueAtTime(740, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.5);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.5);
  }

  // 3. Sub-bass crater detonation rumble + metallic critical chime
  playExplosion({ critical = false } = {}) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();

    const t = this.ctx.currentTime;

    // Sub-bass impact boom
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = "sine";
    boomOsc.frequency.setValueAtTime(critical ? 160 : 130, t);
    boomOsc.frequency.exponentialRampToValueAtTime(28, t + 0.45);

    boomGain.gain.setValueAtTime(critical ? 1.0 : 0.8, t);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    boomOsc.connect(boomGain);
    boomGain.connect(this.masterGain);
    boomOsc.start(t);
    boomOsc.stop(t + 0.5);

    // Heavy debris rumble noise
    this.playNoise({
      duration: critical ? 0.45 : 0.35,
      volume: critical ? 0.65 : 0.45,
      cutoff: critical ? 1400 : 700,
    });

    // Metallic chime for critical direct hit
    if (critical) {
      const chime = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      chime.type = "triangle";
      chime.frequency.setValueAtTime(1180, t);
      chime.frequency.exponentialRampToValueAtTime(1760, t + 0.08);

      chimeGain.gain.setValueAtTime(0.4, t);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      chime.connect(chimeGain);
      chimeGain.connect(this.masterGain);
      chime.start(t);
      chime.stop(t + 0.35);
    }
  }

  // 4. Metallic or fleshy hit impact
  playHit({ critical = false } = {}) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = critical ? "square" : "triangle";
    osc.frequency.setValueAtTime(critical ? 440 : 280, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);

    gain.gain.setValueAtTime(critical ? 0.5 : 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  // 5. Wind atmospheric sweep on turn shift
  playWindChange(windSpeed = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const duration = 0.4;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    const centerFreq = 220 + Math.min(300, Math.abs(windSpeed) * 15);
    osc.frequency.setValueAtTime(centerFreq * 0.8, t);
    osc.frequency.linearRampToValueAtTime(centerFreq * 1.2, t + duration * 0.5);
    osc.frequency.linearRampToValueAtTime(centerFreq * 0.9, t + duration);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(centerFreq, t);
    filter.Q.setValueAtTime(3.0, t);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.08, t + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  // 6. Urgent countdown heartbeat / tick (< 3s)
  playTimerTick(secondsLeft) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();

    const now = Date.now();
    // Throttle to at most one tick per 600ms
    if (now - this.lastTickTime < 600) return;
    this.lastTickTime = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Deep heartbeat thump
    const isVeryUrgent = secondsLeft <= 2;
    osc.type = "sine";
    osc.frequency.setValueAtTime(isVeryUrgent ? 110 : 85, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);

    gain.gain.setValueAtTime(isVeryUrgent ? 0.45 : 0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.1);
  }
}
