import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../src/ui/audio-engine.js";

test("AudioEngine safe fallback when Web Audio API is unavailable in Node", () => {
  const audio = new AudioEngine();
  assert.equal(audio.enabled, true);

  // All methods should safely execute without throwing in a headless environment
  assert.doesNotThrow(() => {
    audio.init();
    audio.playShoot("s1");
    audio.playShoot("ss");
    audio.playWhistle();
    audio.playExplosion({ critical: false });
    audio.playExplosion({ critical: true });
    audio.playHit({ critical: false });
    audio.playHit({ critical: true });
    audio.playWindChange(5);
    audio.playTimerTick(2);
    audio.playNoise();
    audio.toggle();
    assert.equal(audio.enabled, false);
    audio.setMuted(false);
    assert.equal(audio.enabled, true);
  });
});

test("AudioEngine with mock AudioContext executes audio synthesis pipeline", () => {
  // Setup minimal Web Audio API mock
  const createdNodes = [];
  class MockParam {
    constructor() { this.value = 0; }
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
    linearRampToValueAtTime() {}
  }
  class MockNode {
    constructor(type) {
      this.type = type;
      this.frequency = new MockParam();
      this.gain = new MockParam();
      this.Q = new MockParam();
      createdNodes.push(this);
    }
    connect() {}
    start() {}
    stop() {}
  }
  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = new MockNode("destination");
      this.state = "running";
    }
    createGain() { return new MockNode("gain"); }
    createOscillator() { return new MockNode("oscillator"); }
    createBiquadFilter() { return new MockNode("filter"); }
    createBuffer(ch, size, sr) {
      return {
        getChannelData: () => new Float32Array(size),
      };
    }
    createBufferSource() { return new MockNode("bufferSource"); }
  }

  // Inject into globalThis
  globalThis.AudioContext = MockAudioContext;
  try {
    const audio = new AudioEngine();
    audio.init();
    assert.ok(audio.ctx, "Audio context should be initialized");
    assert.ok(audio.masterGain, "Master gain should be initialized");

    audio.playShoot("ss");
    audio.playWhistle();
    audio.playExplosion({ critical: true });
    audio.playHit({ critical: true });
    audio.playWindChange(12);
    audio.playTimerTick(1);

    assert.ok(createdNodes.length > 5, "Audio nodes should have been created for sound synthesis");
  } finally {
    delete globalThis.AudioContext;
  }
});
