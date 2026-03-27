/**
 * sound.js — Procedural sound effects for Dave Ball
 * Uses Web Audio API with oscillators and envelopes.
 * No external audio files needed.
 *
 * Global namespace: GameSound
 * Must be loaded BEFORE main.js.
 */
var GameSound = (function () {
  'use strict';

  var audioCtx = null;
  var masterGain = null;
  var muted = false;
  var initialized = false;

  // Active continuous sounds (keyed by name)
  var activeSounds = {};

  /**
   * Initialize AudioContext on first user interaction.
   */
  function ensureContext() {
    if (audioCtx) return true;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(audioCtx.destination);
      initialized = true;
      return true;
    } catch (e) {
      console.warn('[GameSound] Web Audio API not available.');
      return false;
    }
  }

  /**
   * Resume context if suspended (browser autoplay policy).
   */
  function resumeContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // ── Helpers ──

  function now() {
    return audioCtx ? audioCtx.currentTime : 0;
  }

  function createOsc(type, freq) {
    var osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    return osc;
  }

  function createGain(value) {
    var g = audioCtx.createGain();
    g.gain.value = value || 0;
    return g;
  }

  // ── Sound Effects ──

  /**
   * 1. Line start — short click/blip
   */
  function playLineStart() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    var osc = createOsc('square', 1200);
    var gain = createGain(0);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /**
   * 2. Line growing — soft pulsing tone (subtle, not annoying)
   * Returns nothing; call stopLineGrowing() to end.
   */
  function startLineGrowing() {
    if (!ensureContext() || muted) return;
    if (activeSounds.lineGrowing) return; // already playing
    resumeContext();

    var t = now();

    // Gentle sine wave with slow LFO amplitude modulation
    var osc = createOsc('sine', 220);
    var gain = createGain(0);

    // LFO for gentle pulsing
    var lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 3; // slow pulse
    var lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.015; // very subtle volume variation

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.2);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    lfo.start(t);

    activeSounds.lineGrowing = { osc: osc, gain: gain, lfo: lfo };
  }

  function stopLineGrowing() {
    var s = activeSounds.lineGrowing;
    if (!s) return;
    var t = now();
    try {
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setValueAtTime(s.gain.gain.value, t);
      s.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      s.osc.stop(t + 0.12);
      if (s.lfo) s.lfo.stop(t + 0.12);
    } catch (e) { /* already stopped */ }
    activeSounds.lineGrowing = null;
  }

  /**
   * 3. Line complete — satisfying ascending chime
   */
  function playLineComplete() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Two-tone chime
    var freqs = [660, 880];
    for (var i = 0; i < freqs.length; i++) {
      var osc = createOsc('sine', freqs[i]);
      var gain = createGain(0);
      var offset = i * 0.08;

      gain.gain.setValueAtTime(0, t + offset);
      gain.gain.linearRampToValueAtTime(0.25, t + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.2);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t + offset);
      osc.stop(t + offset + 0.2);
    }
  }

  /**
   * 4. Line failed / life lost — descending buzzer
   */
  function playLineFailed() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    var osc = createOsc('square', 400);
    var gain = createGain(0);

    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.3);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.31);
  }

  /**
   * 5. Region filled — whoosh/sweep
   */
  function playRegionFilled() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    var osc = createOsc('sine', 200);
    var gain = createGain(0);

    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.4);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
    gain.gain.setValueAtTime(0.2, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    // Add a subtle noise layer via detuned second oscillator
    var osc2 = createOsc('triangle', 400);
    osc2.frequency.setValueAtTime(400, t);
    osc2.frequency.exponentialRampToValueAtTime(2000, t + 0.3);
    var gain2 = createGain(0);
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(0.06, t + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(masterGain);
    osc2.connect(gain2);
    gain2.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.41);
    osc2.start(t);
    osc2.stop(t + 0.41);
  }

  /**
   * 6. Ball bounce — subtle low tick
   */
  function playBallBounce() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    var osc = createOsc('sine', 180);
    var gain = createGain(0);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /**
   * 7. Game won / level complete — ascending arpeggio
   */
  function playGameWon() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    var notes = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
    var noteLen = 0.12;

    for (var i = 0; i < notes.length; i++) {
      var osc = createOsc('sine', notes[i]);
      var gain = createGain(0);
      var start = t + i * noteLen;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.01);
      gain.gain.setValueAtTime(0.22, start + noteLen * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen + 0.15);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + noteLen + 0.16);
    }

    // Final shimmer chord
    var chordStart = t + notes.length * noteLen;
    var chordFreqs = [1047, 1319, 1568];
    for (var j = 0; j < chordFreqs.length; j++) {
      var osc2 = createOsc('sine', chordFreqs[j]);
      var gain2 = createGain(0);
      gain2.gain.setValueAtTime(0, chordStart);
      gain2.gain.linearRampToValueAtTime(0.15, chordStart + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.3);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(chordStart);
      osc2.stop(chordStart + 0.31);
    }
  }

  /**
   * 8. Game lost — sad descending tones
   */
  function playGameLost() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    var notes = [440, 370, 311, 247]; // A4 F#4 Eb4 B3
    var noteLen = 0.15;

    for (var i = 0; i < notes.length; i++) {
      var osc = createOsc('triangle', notes[i]);
      var gain = createGain(0);
      var start = t + i * noteLen;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen + 0.1);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + noteLen + 0.11);
    }
  }

  /**
   * 9. Ball fission — pop/split with white noise burst + descending tone
   */
  function playBallFission() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // White noise burst (~80ms) for crackle/pop
    var bufferSize = audioCtx.sampleRate * 0.08;
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.14, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    noiseSrc.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.08);

    // Quick descending tone for the "split" feel
    var osc = createOsc('sine', 900);
    var oscGain = createGain(0);
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(250, t + 0.1);
    oscGain.gain.setValueAtTime(0.12, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  /**
   * 10. Button click — short UI tick
   */
  function playButtonClick() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    var osc = createOsc('square', 800);
    var gain = createGain(0);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.03);
  }

  /**
   * 11. Power-up collected — bright ascending sparkle chime (~200ms)
   */
  function playPowerUpCollect() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Three-note ascending sparkle
    var notes = [1047, 1319, 1568]; // C6 E6 G6
    var noteLen = 0.06;

    for (var i = 0; i < notes.length; i++) {
      var osc = createOsc('sine', notes[i]);
      var gain = createGain(0);
      var start = t + i * noteLen;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen + 0.08);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + noteLen + 0.09);
    }

    // Shimmer overtone for magical feel
    var shimmer = createOsc('triangle', 2637); // E7
    var shimGain = createGain(0);
    var shimStart = t + 0.04;
    shimGain.gain.setValueAtTime(0, shimStart);
    shimGain.gain.linearRampToValueAtTime(0.08, shimStart + 0.02);
    shimGain.gain.exponentialRampToValueAtTime(0.001, shimStart + 0.18);
    shimmer.connect(shimGain);
    shimGain.connect(masterGain);
    shimmer.start(shimStart);
    shimmer.stop(shimStart + 0.19);
  }

  /**
   * 12. Bomb explode — deep boom with low freq burst + noise (~300ms)
   */
  function playBombExplode() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Low frequency boom
    var osc = createOsc('sine', 80);
    var oscGain = createGain(0);
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    oscGain.gain.setValueAtTime(0.35, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.31);

    // Noise burst for crackle
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.3);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    // Low-pass filter to make it rumbly
    var lpf = audioCtx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(600, t);
    lpf.frequency.exponentialRampToValueAtTime(100, t + 0.3);
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.2, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noiseSrc.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.3);
  }

  /**
   * 12b. Nuke explode — massive deep explosion with sharp crack, rolling boom, and mid rumble (~800ms)
   */
  function playNukeExplode() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Sharp crack — high-pass filtered noise burst
    var crackLen = Math.floor(audioCtx.sampleRate * 0.08);
    var crackBuffer = audioCtx.createBuffer(1, crackLen, audioCtx.sampleRate);
    var crackData = crackBuffer.getChannelData(0);
    for (var i = 0; i < crackLen; i++) {
      crackData[i] = (Math.random() * 2 - 1);
    }
    var crackSrc = audioCtx.createBufferSource();
    crackSrc.buffer = crackBuffer;
    var hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(2000, t);
    hpf.frequency.exponentialRampToValueAtTime(800, t + 0.08);
    var crackGain = createGain(0);
    crackGain.gain.setValueAtTime(0.35, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    crackSrc.connect(hpf);
    hpf.connect(crackGain);
    crackGain.connect(masterGain);
    crackSrc.start(t);
    crackSrc.stop(t + 0.09);

    // Deep rolling boom — 30Hz sine oscillator
    var boom = createOsc('sine', 40);
    boom.frequency.setValueAtTime(40, t);
    boom.frequency.exponentialRampToValueAtTime(20, t + 0.8);
    var boomGain = createGain(0);
    boomGain.gain.setValueAtTime(0.45, t + 0.02);
    boomGain.gain.linearRampToValueAtTime(0.4, t + 0.1);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    boom.connect(boomGain);
    boomGain.connect(masterGain);
    boom.start(t);
    boom.stop(t + 0.81);

    // Mid-frequency rumble — noise through bandpass
    var rumbleLen = Math.floor(audioCtx.sampleRate * 0.8);
    var rumbleBuffer = audioCtx.createBuffer(1, rumbleLen, audioCtx.sampleRate);
    var rumbleData = rumbleBuffer.getChannelData(0);
    for (var r = 0; r < rumbleLen; r++) {
      rumbleData[r] = (Math.random() * 2 - 1);
    }
    var rumbleSrc = audioCtx.createBufferSource();
    rumbleSrc.buffer = rumbleBuffer;
    var bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(200, t);
    bpf.frequency.exponentialRampToValueAtTime(60, t + 0.8);
    bpf.Q.value = 2;
    var rumbleLpf = audioCtx.createBiquadFilter();
    rumbleLpf.type = 'lowpass';
    rumbleLpf.frequency.setValueAtTime(400, t);
    rumbleLpf.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    var rumbleGain = createGain(0);
    rumbleGain.gain.setValueAtTime(0.25, t);
    rumbleGain.gain.linearRampToValueAtTime(0.2, t + 0.15);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    rumbleSrc.connect(bpf);
    bpf.connect(rumbleLpf);
    rumbleLpf.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleSrc.start(t);
    rumbleSrc.stop(t + 0.81);
  }

  /**
   * 13. Shield activate — metallic shimmer ascending filtered sweep (~200ms)
   */
  function playShieldActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Ascending filtered sweep
    var osc = createOsc('sawtooth', 400);
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(2400, t + 0.2);

    // Band-pass filter for metallic character
    var bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(800, t);
    bpf.frequency.exponentialRampToValueAtTime(3000, t + 0.2);
    bpf.Q.value = 4;

    var oscGain = createGain(0);
    oscGain.gain.setValueAtTime(0, t);
    oscGain.gain.linearRampToValueAtTime(0.18, t + 0.03);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(bpf);
    bpf.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.21);

    // Shimmer overtone
    var shim = createOsc('sine', 3200);
    shim.frequency.setValueAtTime(3200, t + 0.05);
    shim.frequency.exponentialRampToValueAtTime(4800, t + 0.2);
    var shimGain = createGain(0);
    shimGain.gain.setValueAtTime(0, t + 0.05);
    shimGain.gain.linearRampToValueAtTime(0.06, t + 0.08);
    shimGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    shim.connect(shimGain);
    shimGain.connect(masterGain);
    shim.start(t + 0.05);
    shim.stop(t + 0.21);
  }

  /**
   * 14. Lightning activate — electric zap, quick noise burst with high freq (~150ms)
   */
  function playLightningActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // High-frequency noise burst
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.15);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    // High-pass filter for electric crackle
    var hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 2000;
    hpf.Q.value = 2;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.22, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noiseSrc.connect(hpf);
    hpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.15);

    // Quick descending zap tone
    var osc = createOsc('square', 3000);
    osc.frequency.setValueAtTime(3000, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
    var oscGain = createGain(0);
    oscGain.gain.setValueAtTime(0.12, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  /**
   * 15. Mystery reveal — slot-machine ratchet then pickup chime (~400ms)
   */
  function playMysteryReveal() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Ratchet: rapid ascending clicks
    var ratchetNotes = [600, 700, 820, 950, 1100, 1250];
    var clickLen = 0.04;
    for (var i = 0; i < ratchetNotes.length; i++) {
      var osc = createOsc('square', ratchetNotes[i]);
      var gain = createGain(0);
      var start = t + i * clickLen;
      gain.gain.setValueAtTime(0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.025);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.03);
    }

    // Final chime after ratchet
    var chimeStart = t + ratchetNotes.length * clickLen + 0.02;
    var chimeNotes = [1319, 1568]; // E6 G6
    for (var j = 0; j < chimeNotes.length; j++) {
      var osc2 = createOsc('sine', chimeNotes[j]);
      var gain2 = createGain(0);
      var cs = chimeStart + j * 0.05;
      gain2.gain.setValueAtTime(0, cs);
      gain2.gain.linearRampToValueAtTime(0.2, cs + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, cs + 0.12);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(cs);
      osc2.stop(cs + 0.13);
    }
  }

  /**
   * 16. Freeze activate — crystalline ice shimmer with reverb feel (~300ms)
   */
  function playFreezeActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // High shimmer tone
    var osc1 = createOsc('sine', 2400);
    osc1.frequency.setValueAtTime(2400, t);
    osc1.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
    var gain1 = createGain(0);
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.31);

    // Second detuned shimmer for crystalline width
    var osc2 = createOsc('sine', 2520);
    osc2.frequency.setValueAtTime(2520, t);
    osc2.frequency.exponentialRampToValueAtTime(1900, t + 0.3);
    var gain2 = createGain(0);
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(0.12, t + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t);
    osc2.stop(t + 0.31);

    // Soft noise tail for icy reverb feel
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.25);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 4000;
    hpf.Q.value = 1;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.06, t + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noiseSrc.connect(hpf);
    hpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t + 0.02);
    noiseSrc.stop(t + 0.26);
  }

  /**
   * 17. Shrink activate — comical descending pitch drop (~200ms)
   */
  function playShrinkActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Descending "shrinking" tone
    var osc = createOsc('sine', 1200);
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    var gain = createGain(0);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.21);

    // Second voice slightly detuned for cartoon richness
    var osc2 = createOsc('triangle', 1250);
    osc2.frequency.setValueAtTime(1250, t);
    osc2.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    var gain2 = createGain(0);
    gain2.gain.setValueAtTime(0.1, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t);
    osc2.stop(t + 0.21);
  }

  /**
   * 18. Fruit collect — bright ascending two-note chime (~100ms), classic arcade pickup
   */
  function playFruitCollect() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Quick two-note ascending chime
    var note1 = createOsc('sine', 1047); // C6
    var gain1 = createGain(0);
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(0.22, t + 0.008);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    note1.connect(gain1);
    gain1.connect(masterGain);
    note1.start(t);
    note1.stop(t + 0.07);

    var note2 = createOsc('sine', 1568); // G6
    var gain2 = createGain(0);
    var t2 = t + 0.04;
    gain2.gain.setValueAtTime(0, t2);
    gain2.gain.linearRampToValueAtTime(0.22, t2 + 0.008);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.06);
    note2.connect(gain2);
    gain2.connect(masterGain);
    note2.start(t2);
    note2.stop(t2 + 0.07);
  }

  /**
   * 19. Skull capture — ominous dark tone with dissonance (~300ms), feels BAD
   */
  function playSkullCapture() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Deep ominous bass tone
    var bass = createOsc('sawtooth', 80);
    bass.frequency.setValueAtTime(80, t);
    bass.frequency.exponentialRampToValueAtTime(50, t + 0.3);
    var bassGain = createGain(0);
    bassGain.gain.setValueAtTime(0.25, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    bass.connect(bassGain);
    bassGain.connect(masterGain);
    bass.start(t);
    bass.stop(t + 0.31);

    // Dissonant tritone (devil's interval)
    var dis = createOsc('square', 113);
    dis.frequency.setValueAtTime(113, t);
    dis.frequency.exponentialRampToValueAtTime(70, t + 0.3);
    var disGain = createGain(0);
    disGain.gain.setValueAtTime(0.12, t);
    disGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    dis.connect(disGain);
    disGain.connect(masterGain);
    dis.start(t);
    dis.stop(t + 0.31);

    // Dark noise burst for menace
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.25);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var lpf = audioCtx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 600;
    lpf.Q.value = 3;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.1, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noiseSrc.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.26);
  }

  /**
   * 20. Grow activate — ominous ascending tone that swells (~300ms), threatening
   */
  function playGrowActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Deep ascending swell
    var osc = createOsc('sawtooth', 80);
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    var gain = createGain(0);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.31);

    // Dissonant second voice for menace
    var osc2 = createOsc('square', 113);
    osc2.frequency.setValueAtTime(113, t);
    osc2.frequency.exponentialRampToValueAtTime(285, t + 0.3);
    var gain2 = createGain(0);
    gain2.gain.setValueAtTime(0.03, t);
    gain2.gain.linearRampToValueAtTime(0.12, t + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t);
    osc2.stop(t + 0.31);
  }

  /**
   * Gooey/squelchy sound for fusion power-up activation.
   */
  function playFusionActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Low-pass filtered noise burst with descending pitch
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.2);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var lpf = audioCtx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(800, t);
    lpf.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    lpf.Q.value = 5;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.22, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noiseSrc.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.21);

    // Descending squelch tone
    var osc = createOsc('sine', 400);
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    var oscGain = createGain(0);
    oscGain.gain.setValueAtTime(0.18, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  /**
   * Fission activate — crackling energy sound, ascending buzz (~300ms).
   */
  function playFissionActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Crackling noise burst
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.3);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (i % 80 < 40 ? 1 : 0.3);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(600, t);
    hpf.frequency.exponentialRampToValueAtTime(2000, t + 0.3);
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.15, t);
    noiseGain.gain.linearRampToValueAtTime(0.25, t + 0.15);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noiseSrc.connect(hpf);
    hpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.31);

    // Ascending buzz tone
    var osc = createOsc('sawtooth', 150);
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    var oscGain = createGain(0);
    oscGain.gain.setValueAtTime(0.1, t);
    oscGain.gain.linearRampToValueAtTime(0.2, t + 0.15);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.31);
  }

  /**
   * Wave activate — whooshing water wave sound (~400ms).
   */
  function playWaveActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Filtered noise sweep for whoosh
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.45);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    // Band-pass sweeping for water character
    var bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(400, t);
    bpf.frequency.exponentialRampToValueAtTime(2400, t + 0.2);
    bpf.frequency.exponentialRampToValueAtTime(600, t + 0.4);
    bpf.Q.value = 2;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.05, t);
    noiseGain.gain.linearRampToValueAtTime(0.22, t + 0.12);
    noiseGain.gain.linearRampToValueAtTime(0.18, t + 0.25);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noiseSrc.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.42);

    // Subtle sine undertone for depth
    var osc = createOsc('sine', 200);
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    var oscGain = createGain(0);
    oscGain.gain.setValueAtTime(0.08, t);
    oscGain.gain.linearRampToValueAtTime(0.12, t + 0.15);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.41);
  }

  /**
   * Web activate — soft "ssshh" web-spreading sound. Filtered white noise with gentle fade-in/out (~400ms).
   */
  function playWebActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Gentle filtered white noise burst
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.45);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    // Band-pass filter for silky "ssshh" character
    var bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(3000, t);
    bpf.frequency.linearRampToValueAtTime(1800, t + 0.4);
    bpf.Q.value = 1.5;

    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.14, t + 0.08);
    noiseGain.gain.setValueAtTime(0.14, t + 0.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    noiseSrc.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.42);
  }

  /**
   * Portal activate — sci-fi whoosh. Descending then ascending filtered sweep (~400ms).
   */
  function playPortalActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Descending sweep — spacey tone going into the portal
    var osc1 = createOsc('sine', 800);
    osc1.frequency.setValueAtTime(800, t);
    osc1.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    osc1.frequency.exponentialRampToValueAtTime(600, t + 0.4);
    var gain1 = createGain(0);
    gain1.gain.setValueAtTime(0.18, t);
    gain1.gain.linearRampToValueAtTime(0.12, t + 0.2);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.42);

    // Filtered noise for spacey texture
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.4);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(2000, t);
    bpf.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    bpf.frequency.exponentialRampToValueAtTime(1500, t + 0.4);
    bpf.Q.value = 3;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.1, t + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noiseSrc.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.42);

    // Subtle harmonic overtone
    var osc2 = createOsc('triangle', 400);
    osc2.frequency.setValueAtTime(400, t);
    osc2.frequency.exponentialRampToValueAtTime(100, t + 0.2);
    osc2.frequency.exponentialRampToValueAtTime(300, t + 0.38);
    var gain2 = createGain(0);
    gain2.gain.setValueAtTime(0.06, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t);
    osc2.stop(t + 0.4);
  }

  /**
   * Ball teleport — quick "zwooop" wormhole effect (~200ms). Fast frequency sweep down then up.
   */
  function playBallTeleport() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Fast down-up sweep — feels like going through a wormhole
    var osc = createOsc('sine', 600);
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    osc.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    var oscGain = createGain(0);
    oscGain.gain.setValueAtTime(0.2, t);
    oscGain.gain.linearRampToValueAtTime(0.15, t + 0.1);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.22);

    // Short noise burst for texture
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.15);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(3000, t);
    hpf.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    hpf.Q.value = 2;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.08, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noiseSrc.connect(hpf);
    hpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.16);
  }

  /**
   * Satisfying "plop" merge sound — quick low thud + rising tone.
   */
  function playBallMerge() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Quick low thud
    var osc1 = createOsc('sine', 100);
    osc1.frequency.setValueAtTime(100, t);
    osc1.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    var gain1 = createGain(0);
    gain1.gain.setValueAtTime(0.3, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.09);

    // Subtle rising tone — feels like two becoming one
    var osc2 = createOsc('triangle', 220);
    osc2.frequency.setValueAtTime(220, t + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(440, t + 0.15);
    var gain2 = createGain(0);
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(0.12, t + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t + 0.04);
    osc2.stop(t + 0.16);
  }

  function toggleMute() {
    muted = !muted;
    if (muted) {
      stopLineGrowing();
      stopMusic();
      if (masterGain) masterGain.gain.value = 0;
    } else {
      if (masterGain) masterGain.gain.value = 0.4;
    }
    return muted;
  }

  function isMuted() {
    return muted;
  }

  // ── Initialize on first click ──
  function initOnInteraction() {
    if (initialized) return;
    ensureContext();
    resumeContext();
  }

  document.addEventListener('click', initOnInteraction, { once: true });
  document.addEventListener('keydown', initOnInteraction, { once: true });

  // Public API
  /**
   * Sinkhole activate — deep ominous rumble. Very low frequency with wobble (~500ms).
   */
  function playSinkholeActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Deep sub-bass rumble
    var osc1 = createOsc('sine', 55);
    osc1.frequency.setValueAtTime(55, t);
    osc1.frequency.linearRampToValueAtTime(40, t + 0.5);
    var gain1 = createGain(0);
    gain1.gain.setValueAtTime(0.22, t);
    gain1.gain.setValueAtTime(0.22, t + 0.3);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.52);

    // Wobble LFO modulating a second low tone
    var osc2 = createOsc('triangle', 70);
    osc2.frequency.setValueAtTime(70, t);
    osc2.frequency.linearRampToValueAtTime(45, t + 0.5);
    var lfo = createOsc('sine', 6);
    var lfoGain = createGain(8);
    lfo.connect(lfoGain);
    lfoGain.connect(osc2.frequency);
    var gain2 = createGain(0);
    gain2.gain.setValueAtTime(0.15, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    lfo.start(t);
    osc2.start(t);
    lfo.stop(t + 0.52);
    osc2.stop(t + 0.52);

    // Rumbling noise layer (low-pass filtered)
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.5);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var lpf = audioCtx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(200, t);
    lpf.frequency.linearRampToValueAtTime(80, t + 0.5);
    lpf.Q.value = 1;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.1, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    noiseSrc.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.52);
  }

  /**
   * Sinkhole destroy — satisfying "crunch" + whoosh. Noise burst through low-pass filter, descending (~250ms).
   */
  function playSinkholeDestroy() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Short descending crunch tone
    var osc = createOsc('sawtooth', 200);
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    var gain1 = createGain(0);
    gain1.gain.setValueAtTime(0.18, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain1);
    gain1.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.22);

    // Noise burst pulled through descending low-pass (whoosh-crunch)
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.25);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var lpf = audioCtx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(3000, t);
    lpf.frequency.exponentialRampToValueAtTime(100, t + 0.2);
    lpf.Q.value = 4;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.2, t);
    noiseGain.gain.linearRampToValueAtTime(0.15, t + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noiseSrc.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.27);
  }

  /**
   * Jackpot capture — slot machine jackpot! Ascending arpeggio building into a triumphant chord,
   * with bell/coin tones layered in. The most dramatic sound in the game (~1000ms).
   */
  function playJackpotCapture() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Ascending arpeggio: C5 → E5 → G5 → C6 (coin-like bell tones)
    var arpNotes = [523.25, 659.25, 783.99, 1046.50];
    for (var ai = 0; ai < arpNotes.length; ai++) {
      var noteTime = t + ai * 0.12;
      var arpOsc = createOsc('sine', arpNotes[ai]);
      var arpOsc2 = createOsc('triangle', arpNotes[ai] * 2.01); // shimmer harmonic
      var arpGain = createGain(0);
      arpGain.gain.setValueAtTime(0.18, noteTime);
      arpGain.gain.exponentialRampToValueAtTime(0.04, noteTime + 0.15);
      arpGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);
      var arpGain2 = createGain(0);
      arpGain2.gain.setValueAtTime(0.06, noteTime);
      arpGain2.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.2);
      arpOsc.connect(arpGain);
      arpOsc2.connect(arpGain2);
      arpGain.connect(masterGain);
      arpGain2.connect(masterGain);
      arpOsc.start(noteTime);
      arpOsc.stop(noteTime + 0.27);
      arpOsc2.start(noteTime);
      arpOsc2.stop(noteTime + 0.22);
    }

    // Triumphant chord at the peak: C6 + E6 + G6 (major chord with sustain)
    var chordStart = t + 0.48;
    var chordFreqs = [1046.50, 1318.51, 1567.98];
    for (var ci = 0; ci < chordFreqs.length; ci++) {
      var chOsc = createOsc('sine', chordFreqs[ci]);
      var chOsc2 = createOsc('triangle', chordFreqs[ci]); // fuller body
      var chGain = createGain(0);
      chGain.gain.setValueAtTime(0.15, chordStart);
      chGain.gain.setValueAtTime(0.15, chordStart + 0.2);
      chGain.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.55);
      var chGain2 = createGain(0);
      chGain2.gain.setValueAtTime(0.07, chordStart);
      chGain2.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.5);
      chOsc.connect(chGain);
      chOsc2.connect(chGain2);
      chGain.connect(masterGain);
      chGain2.connect(masterGain);
      chOsc.start(chordStart);
      chOsc.stop(chordStart + 0.57);
      chOsc2.start(chordStart);
      chOsc2.stop(chordStart + 0.52);
    }

    // Bell/coin metallic shimmer layer
    var bellStart = t + 0.1;
    var bellOsc = createOsc('square', 2637); // high E7 metallic ping
    var bellGain = createGain(0);
    bellGain.gain.setValueAtTime(0.04, bellStart);
    bellGain.gain.exponentialRampToValueAtTime(0.001, bellStart + 0.08);
    var bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 3000;
    bpf.Q.value = 8;
    bellOsc.connect(bpf);
    bpf.connect(bellGain);
    bellGain.connect(masterGain);
    bellOsc.start(bellStart);
    bellOsc.stop(bellStart + 0.1);

    // Second bell at chord peak
    var bell2Start = t + 0.5;
    var bell2Osc = createOsc('square', 3520); // A7
    var bell2Gain = createGain(0);
    bell2Gain.gain.setValueAtTime(0.035, bell2Start);
    bell2Gain.gain.exponentialRampToValueAtTime(0.001, bell2Start + 0.1);
    var bpf2 = audioCtx.createBiquadFilter();
    bpf2.type = 'bandpass';
    bpf2.frequency.value = 4000;
    bpf2.Q.value = 6;
    bell2Osc.connect(bpf2);
    bpf2.connect(bell2Gain);
    bell2Gain.connect(masterGain);
    bell2Osc.start(bell2Start);
    bell2Osc.stop(bell2Start + 0.12);

    // Sub-bass foundation rumble for impact
    var subOsc = createOsc('sine', 80);
    var subGain = createGain(0);
    subGain.gain.setValueAtTime(0.12, t);
    subGain.gain.setValueAtTime(0.12, t + 0.3);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    subOsc.connect(subGain);
    subGain.connect(masterGain);
    subOsc.start(t);
    subOsc.stop(t + 1.02);

    // Noise shimmer (coins cascading)
    var shimBuf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.6), audioCtx.sampleRate);
    var shimData = shimBuf.getChannelData(0);
    for (var si = 0; si < shimData.length; si++) {
      shimData[si] = (Math.random() * 2 - 1);
    }
    var shimSrc = audioCtx.createBufferSource();
    shimSrc.buffer = shimBuf;
    var shimHpf = audioCtx.createBiquadFilter();
    shimHpf.type = 'highpass';
    shimHpf.frequency.value = 6000;
    shimHpf.Q.value = 2;
    var shimGain = createGain(0);
    shimGain.gain.setValueAtTime(0.03, t + 0.45);
    shimGain.gain.setValueAtTime(0.03, t + 0.6);
    shimGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    shimSrc.connect(shimHpf);
    shimHpf.connect(shimGain);
    shimGain.connect(masterGain);
    shimSrc.start(t + 0.45);
    shimSrc.stop(t + 1.02);
  }

  /**
   * Firework launch — ascending whistle (~300ms)
   */
  function playFireworkLaunch() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Ascending sine whistle
    var osc = createOsc('sine', 400);
    var gain = createGain(0);

    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(2000, t + 0.25);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.32);

    // Faint noise layer for "fizz" texture
    var bufSize = audioCtx.sampleRate * 0.3;
    var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = buf;

    var hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3000;

    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.04, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    noiseSrc.connect(hpf);
    hpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.32);
  }

  /**
   * Firework burst — crisp pop/crackle (~200ms)
   */
  function playFireworkBurst() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Sharp pop — short noise burst
    var bufSize = audioCtx.sampleRate * 0.2;
    var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = buf;

    var bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 2000;
    bpf.Q.value = 0.8;

    var popGain = createGain(0);
    popGain.gain.setValueAtTime(0.25, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    noiseSrc.connect(bpf);
    bpf.connect(popGain);
    popGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.2);

    // Crackle tail — high-freq shimmer
    var crackleSize = audioCtx.sampleRate * 0.15;
    var crklBuf = audioCtx.createBuffer(1, crackleSize, audioCtx.sampleRate);
    var crklData = crklBuf.getChannelData(0);
    for (var j = 0; j < crackleSize; j++) {
      crklData[j] = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 1 : 0.1);
    }
    var crklSrc = audioCtx.createBufferSource();
    crklSrc.buffer = crklBuf;

    var crklHpf = audioCtx.createBiquadFilter();
    crklHpf.type = 'highpass';
    crklHpf.frequency.value = 4000;

    var crklGain = createGain(0);
    crklGain.gain.setValueAtTime(0.08, t + 0.05);
    crklGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    crklSrc.connect(crklHpf);
    crklHpf.connect(crklGain);
    crklGain.connect(masterGain);
    crklSrc.start(t + 0.05);
    crklSrc.stop(t + 0.22);
  }

  // ── Procedural 8-Bit Background Music (NES-style, original composition) ──

  var music = {
    playing: false,
    intensity: 1,       // 0=calm, 1=normal, 2=intense
    schedulerId: null,
    musicGain: null,     // sub-mix for all music channels
    noiseBuffer: null,   // pre-generated noise buffer for drums
    scheduleAhead: 0.15, // schedule notes 150ms ahead
    nextNoteTime: 0,     // when the next note is due (audioCtx time)
    currentStep: 0,      // current step in the sequence
    stepsPerBeat: 2      // 8th-note resolution
  };

  // ── Original melody & chord data (A minor, all original) ──

  // Note frequencies (chromatic, multiple octaves for theme variety)
  var N = {
    C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00,
    A2: 110.00, Bb2: 116.54, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
    A3: 220.00, Bb3: 233.08, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, Fs4: 369.99,
    G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, Fs5: 739.99,
    G5: 783.99, Gs5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51
  };

  // ── Per-theme music configurations ──

  var MUSIC_THEMES = {
    // Default (green) — Classic NES-style A minor
    'default': {
      melody: [
        N.E4, N.E4, N.A4, N.A4, N.G4, N.F4, N.E4, 0,
        N.D4, N.E4, N.F4, N.E4, N.D4, N.C4, 0, 0,
        N.E4, N.F4, N.G4, N.A4, N.B4, N.A4, N.G4, N.E4,
        N.F4, N.E4, N.D4, N.C4, N.D4, N.E4, 0, 0
      ],
      melodyHigh: [
        N.E5, N.E5, N.A5, N.A5, N.G5, N.F5, N.E5, 0,
        N.D5, N.E5, N.F5, N.E5, N.D5, N.C5, 0, 0,
        N.E5, N.F5, N.G5, N.A5, N.B5, N.A5, N.G5, N.E5,
        N.F5, N.E5, N.D5, N.C5, N.D5, N.E5, 0, 0
      ],
      bass: [
        N.A2, 0, N.A2, 0, N.A2, 0, N.E2, 0,
        N.F2, 0, N.F2, 0, N.G2, 0, N.A2, 0,
        N.A2, 0, N.A2, 0, N.C3, 0, N.E2, 0,
        N.F2, 0, N.D3, 0, N.E2, 0, N.A2, 0
      ],
      drums: [
        1, 0, 2, 0, 1, 0, 2, 0,
        1, 0, 2, 2, 1, 0, 2, 0,
        1, 0, 2, 0, 1, 2, 2, 0,
        1, 0, 2, 2, 1, 0, 2, 1
      ],
      drumsIntense: [
        1, 2, 3, 2, 1, 2, 3, 2,
        1, 2, 3, 2, 1, 2, 3, 1,
        1, 2, 3, 2, 1, 2, 3, 2,
        3, 2, 3, 2, 1, 1, 3, 1
      ],
      tempo: 150, tempoCalm: 110, tempoIntense: 180,
      leadWave: 'square', bassWave: 'triangle',
      melodyStaccato: 0.6, vibratoRate: 6, vibratoDepth: 0.008,
      kickStart: 150, kickEnd: 40, kickDecay: 0.10, kickVolume: 0.45,
      hihatVolume: 0.18, hihatDecay: 0.04
    },

    // Neon (magenta) — Synthwave/cyberpunk, D minor
    'neon': {
      melody: [
        N.D4, 0, N.F4, 0, N.A4, N.A4, N.G4, 0,
        N.F4, 0, N.E4, 0, N.D4, 0, 0, 0,
        N.A4, 0, N.Bb4, 0, N.A4, N.G4, N.F4, 0,
        N.G4, 0, N.F4, N.E4, N.D4, 0, 0, 0
      ],
      melodyHigh: [
        N.D5, 0, N.F5, 0, N.A5, N.A5, N.G5, 0,
        N.F5, 0, N.E5, 0, N.D5, 0, 0, 0,
        N.A5, 0, N.Bb5, 0, N.A5, N.G5, N.F5, 0,
        N.G5, 0, N.F5, N.E5, N.D5, 0, 0, 0
      ],
      bass: [
        N.D2, 0, 0, N.D2, 0, 0, 0, 0,
        N.Bb2, 0, 0, N.Bb2, 0, 0, 0, 0,
        N.F2, 0, 0, N.F2, 0, 0, 0, 0,
        N.G2, 0, 0, N.A2, N.D2, 0, 0, 0
      ],
      drums: [
        1, 0, 2, 2, 0, 0, 2, 2,
        1, 0, 2, 0, 0, 0, 2, 2,
        1, 0, 2, 2, 0, 0, 2, 2,
        1, 0, 2, 0, 1, 0, 2, 0
      ],
      drumsIntense: [
        1, 2, 3, 2, 1, 2, 3, 2,
        1, 0, 3, 2, 1, 2, 3, 2,
        1, 2, 3, 2, 1, 2, 3, 2,
        3, 2, 3, 2, 3, 2, 3, 1
      ],
      tempo: 120, tempoCalm: 90, tempoIntense: 150,
      leadWave: 'sawtooth', bassWave: 'sawtooth',
      melodyStaccato: 0.8, vibratoRate: 4, vibratoDepth: 0.005,
      kickStart: 120, kickEnd: 35, kickDecay: 0.15, kickVolume: 0.40,
      hihatVolume: 0.15, hihatDecay: 0.08
    },

    // Retro (amber) — Warm lo-fi chiptune, C major
    'retro': {
      melody: [
        N.C4, N.E4, N.G4, N.E4, N.F4, N.A4, N.G4, 0,
        N.E4, N.D4, N.C4, N.D4, N.E4, N.G4, 0, 0,
        N.A4, N.G4, N.E4, N.C4, N.D4, N.F4, N.E4, N.D4,
        N.C4, N.E4, N.G4, N.A4, N.G4, N.E4, N.C4, 0
      ],
      melodyHigh: [
        N.C5, N.E5, N.G5, N.E5, N.F5, N.A5, N.G5, 0,
        N.E5, N.D5, N.C5, N.D5, N.E5, N.G5, 0, 0,
        N.A5, N.G5, N.E5, N.C5, N.D5, N.F5, N.E5, N.D5,
        N.C5, N.E5, N.G5, N.A5, N.G5, N.E5, N.C5, 0
      ],
      bass: [
        N.C3, 0, N.E2, 0, N.G2, 0, N.C3, 0,
        N.F2, 0, N.A2, 0, N.G2, 0, N.E2, 0,
        N.A2, 0, N.F2, 0, N.D3, 0, N.G2, 0,
        N.C3, 0, N.E2, 0, N.G2, 0, N.C3, 0
      ],
      drums: [
        1, 0, 2, 0, 0, 0, 2, 0,
        1, 0, 2, 0, 1, 0, 0, 0,
        1, 0, 2, 0, 0, 0, 2, 0,
        1, 0, 0, 0, 1, 0, 2, 0
      ],
      drumsIntense: [
        1, 2, 2, 2, 1, 2, 2, 2,
        1, 2, 3, 2, 1, 2, 2, 2,
        1, 2, 2, 2, 1, 2, 3, 2,
        1, 2, 2, 2, 3, 2, 3, 1
      ],
      tempo: 140, tempoCalm: 100, tempoIntense: 170,
      leadWave: 'square', bassWave: 'triangle',
      melodyStaccato: 0.5, vibratoRate: 8, vibratoDepth: 0.006,
      kickStart: 160, kickEnd: 45, kickDecay: 0.08, kickVolume: 0.40,
      hihatVolume: 0.15, hihatDecay: 0.03
    },

    // Ocean (blue) — Ambient/chill, E minor
    'ocean': {
      melody: [
        N.E4, 0, 0, N.G4, 0, 0, N.Fs4, N.E4,
        0, 0, N.B3, 0, 0, N.D4, 0, 0,
        N.G4, 0, 0, N.A4, 0, 0, N.B4, 0,
        N.A4, 0, N.G4, 0, N.Fs4, 0, N.E4, 0
      ],
      melodyHigh: [
        N.E5, 0, 0, N.G5, 0, 0, N.Fs5, N.E5,
        0, 0, N.B4, 0, 0, N.D5, 0, 0,
        N.G5, 0, 0, N.A5, 0, 0, N.B5, 0,
        N.A5, 0, N.G5, 0, N.Fs5, 0, N.E5, 0
      ],
      bass: [
        N.E2, 0, 0, 0, N.G2, 0, 0, 0,
        N.B2, 0, 0, 0, N.A2, 0, 0, 0,
        N.C3, 0, 0, 0, N.B2, 0, 0, 0,
        N.A2, 0, 0, 0, N.E2, 0, 0, 0
      ],
      drums: [
        0, 0, 2, 0, 0, 0, 2, 0,
        0, 0, 2, 0, 0, 0, 0, 0,
        1, 0, 2, 0, 0, 0, 2, 0,
        0, 0, 0, 0, 0, 0, 2, 0
      ],
      drumsIntense: [
        1, 0, 2, 2, 0, 0, 2, 0,
        1, 0, 2, 0, 0, 0, 2, 2,
        1, 0, 2, 2, 0, 0, 2, 0,
        1, 0, 2, 0, 1, 0, 2, 0
      ],
      tempo: 100, tempoCalm: 75, tempoIntense: 130,
      leadWave: 'sine', bassWave: 'triangle',
      melodyStaccato: 0.85, vibratoRate: 3, vibratoDepth: 0.003,
      kickStart: 130, kickEnd: 35, kickDecay: 0.12, kickVolume: 0.25,
      hihatVolume: 0.10, hihatDecay: 0.05
    },

    // Lava (red) — Aggressive/intense, E minor chromatic
    'lava': {
      melody: [
        N.E4, N.E4, N.G4, N.Ab4, N.E4, 0, N.B4, N.Ab4,
        N.G4, N.Fs4, N.E4, 0, N.G4, N.Ab4, N.B4, 0,
        N.E4, N.Fs4, N.G4, N.Ab4, N.B4, N.Ab4, N.G4, N.Fs4,
        N.E4, 0, N.Ab4, N.G4, N.Fs4, N.E4, 0, 0
      ],
      melodyHigh: [
        N.E5, N.E5, N.G5, N.Gs5, N.E5, 0, N.B5, N.Gs5,
        N.G5, N.Fs5, N.E5, 0, N.G5, N.Gs5, N.B5, 0,
        N.E5, N.Fs5, N.G5, N.Gs5, N.B5, N.Gs5, N.G5, N.Fs5,
        N.E5, 0, N.Gs5, N.G5, N.Fs5, N.E5, 0, 0
      ],
      bass: [
        N.E2, N.E2, N.E2, N.E2, N.G2, N.G2, N.A2, N.A2,
        N.B2, N.B2, N.A2, N.A2, N.G2, N.G2, N.E2, N.E2,
        N.E2, N.E2, N.F2, N.F2, N.G2, N.G2, N.A2, N.A2,
        N.B2, N.B2, N.A2, N.A2, N.G2, N.E2, N.E2, N.E2
      ],
      drums: [
        1, 2, 2, 2, 1, 2, 2, 2,
        1, 2, 1, 2, 1, 2, 2, 2,
        1, 2, 2, 2, 1, 2, 1, 2,
        1, 2, 2, 2, 3, 2, 3, 2
      ],
      drumsIntense: [
        3, 2, 3, 2, 3, 2, 3, 2,
        3, 2, 3, 2, 3, 2, 3, 1,
        3, 2, 3, 2, 3, 2, 3, 2,
        3, 2, 3, 1, 3, 1, 3, 1
      ],
      tempo: 170, tempoCalm: 130, tempoIntense: 200,
      leadWave: 'square', bassWave: 'sawtooth',
      melodyStaccato: 0.5, vibratoRate: 12, vibratoDepth: 0.015,
      kickStart: 180, kickEnd: 40, kickDecay: 0.08, kickVolume: 0.55,
      hihatVolume: 0.22, hihatDecay: 0.03
    }
  };

  var currentTheme = MUSIC_THEMES['default'];

  function createNoiseBuffer() {
    if (music.noiseBuffer) return;
    var sampleRate = audioCtx.sampleRate;
    var bufLen = sampleRate * 2;
    music.noiseBuffer = audioCtx.createBuffer(1, bufLen, sampleRate);
    var data = music.noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufLen; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  function getMusicGain() {
    if (!music.musicGain) {
      music.musicGain = audioCtx.createGain();
      music.musicGain.gain.value = 0.30; // music at 30% of master
      music.musicGain.connect(masterGain);
    }
    return music.musicGain;
  }

  function getStepDuration() {
    var bpm = currentTheme.tempo;
    if (music.intensity === 0) bpm = currentTheme.tempoCalm;
    else if (music.intensity === 2) bpm = currentTheme.tempoIntense;
    return 60.0 / bpm / music.stepsPerBeat;
  }

  function playMelodyNote(freq, time, duration) {
    if (freq === 0) return; // rest
    var noteLen = duration * currentTheme.melodyStaccato;
    var osc = audioCtx.createOscillator();
    osc.type = currentTheme.leadWave;
    osc.frequency.setValueAtTime(freq, time);

    // Vibrato (rate and depth vary per theme)
    var lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = currentTheme.vibratoRate;
    var lfoGain = audioCtx.createGain();
    lfoGain.gain.value = freq * currentTheme.vibratoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    var env = audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.28, time + 0.005); // sharp attack
    env.gain.setValueAtTime(0.22, time + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, time + noteLen);

    osc.connect(env);
    env.connect(getMusicGain());
    osc.start(time);
    osc.stop(time + noteLen + 0.01);
    lfo.start(time);
    lfo.stop(time + noteLen + 0.01);
  }

  function playBassNote(freq, time, duration) {
    if (freq === 0) return;
    var noteLen = duration * 0.85;
    var osc = audioCtx.createOscillator();
    osc.type = currentTheme.bassWave;
    osc.frequency.setValueAtTime(freq, time);

    var env = audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.35, time + 0.005);
    env.gain.setValueAtTime(0.30, time + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, time + noteLen);

    osc.connect(env);
    env.connect(getMusicGain());
    osc.start(time);
    osc.stop(time + noteLen + 0.01);
  }

  function playKick(time) {
    var osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(currentTheme.kickStart, time);
    osc.frequency.exponentialRampToValueAtTime(currentTheme.kickEnd, time + 0.08);

    var env = audioCtx.createGain();
    env.gain.setValueAtTime(currentTheme.kickVolume, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + currentTheme.kickDecay);

    osc.connect(env);
    env.connect(getMusicGain());
    osc.start(time);
    osc.stop(time + currentTheme.kickDecay + 0.02);
  }

  function playHihat(time) {
    if (!music.noiseBuffer) return;
    var src = audioCtx.createBufferSource();
    src.buffer = music.noiseBuffer;

    var hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 7000;

    var env = audioCtx.createGain();
    env.gain.setValueAtTime(currentTheme.hihatVolume, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + currentTheme.hihatDecay);

    src.connect(hpf);
    hpf.connect(env);
    env.connect(getMusicGain());
    src.start(time);
    src.stop(time + currentTheme.hihatDecay + 0.02);
  }

  function scheduleStep(step, time) {
    var stepDur = getStepDuration();
    var seqLen = currentTheme.melody.length;
    var idx = step % seqLen;

    // Lead melody (skip at intensity 0 for first half, play softly)
    if (music.intensity >= 1 || (idx % 4 === 0)) {
      var mel = music.intensity === 2 ? currentTheme.melodyHigh : currentTheme.melody;
      playMelodyNote(mel[idx], time, stepDur);
    }

    // Bass line (always plays)
    playBassNote(currentTheme.bass[idx], time, stepDur);

    // Drums (none at intensity 0, light at 1, aggressive at 2)
    if (music.intensity >= 1) {
      var dp = music.intensity === 2 ? currentTheme.drumsIntense : currentTheme.drums;
      var drum = dp[idx];
      if (drum === 1 || drum === 3) playKick(time);
      if (drum === 2 || drum === 3) playHihat(time);
    }
  }

  function musicScheduler() {
    if (!music.playing || !audioCtx) return;
    var currentTime = audioCtx.currentTime;
    while (music.nextNoteTime < currentTime + music.scheduleAhead) {
      scheduleStep(music.currentStep, music.nextNoteTime);
      music.nextNoteTime += getStepDuration();
      music.currentStep++;
    }
  }

  function startMusic() {
    if (!ensureContext() || muted) return;
    if (music.playing) return;
    resumeContext();
    createNoiseBuffer();
    getMusicGain();
    music.playing = true;
    music.currentStep = 0;
    music.nextNoteTime = audioCtx.currentTime + 0.05;
    music.schedulerId = setInterval(musicScheduler, 50);
  }

  function setMusicTheme(themeName) {
    var theme = MUSIC_THEMES[themeName] || MUSIC_THEMES['default'];
    if (theme === currentTheme) return;
    currentTheme = theme;
    // If music is playing, restart with the new theme
    if (music.playing) {
      stopMusic();
      startMusic();
    }
  }

  function stopMusic() {
    music.playing = false;
    if (music.schedulerId) {
      clearInterval(music.schedulerId);
      music.schedulerId = null;
    }
  }

  function setMusicIntensity(level) {
    if (level < 0) level = 0;
    if (level > 2) level = 2;
    music.intensity = level;
  }

  /**
   * Snake activate — slithery hiss. Filtered noise with descending pitch (~300ms).
   */
  function playSnakeActivate() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Hissy noise through bandpass filter with descending center frequency
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.35);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(4000, t);
    bpf.frequency.exponentialRampToValueAtTime(800, t + 0.3);
    bpf.Q.value = 3;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.18, t);
    noiseGain.gain.setValueAtTime(0.18, t + 0.1);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noiseSrc.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.32);

    // Subtle sine undertone sliding down
    var osc = createOsc('sine', 300);
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.25);
    var oscGain = createGain(0);
    oscGain.gain.setValueAtTime(0.1, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /**
   * Snake eat — quick "chomp". Short low-freq pop with a snap (~150ms).
   */
  function playSnakeEat() {
    if (!ensureContext() || muted) return;
    resumeContext();
    var t = now();

    // Low pop
    var osc = createOsc('sine', 180);
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    var gain1 = createGain(0);
    gain1.gain.setValueAtTime(0.22, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain1);
    gain1.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.14);

    // Snap noise burst (very short)
    var bufferSize = Math.floor(audioCtx.sampleRate * 0.08);
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    var noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 2000;
    var noiseGain = createGain(0);
    noiseGain.gain.setValueAtTime(0.12, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noiseSrc.connect(hpf);
    hpf.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSrc.start(t);
    noiseSrc.stop(t + 0.08);
  }

  return {
    playLineStart: playLineStart,
    startLineGrowing: startLineGrowing,
    stopLineGrowing: stopLineGrowing,
    playLineComplete: playLineComplete,
    playLineFailed: playLineFailed,
    playRegionFilled: playRegionFilled,
    playBallBounce: playBallBounce,
    playBallFission: playBallFission,
    playGameWon: playGameWon,
    playGameLost: playGameLost,
    playButtonClick: playButtonClick,
    playPowerUpCollect: playPowerUpCollect,
    playBombExplode: playBombExplode,
    playNukeExplode: playNukeExplode,
    playShieldActivate: playShieldActivate,
    playLightningActivate: playLightningActivate,
    playMysteryReveal: playMysteryReveal,
    playFreezeActivate: playFreezeActivate,
    playShrinkActivate: playShrinkActivate,
    playSkullCapture: playSkullCapture,
    playGrowActivate: playGrowActivate,
    playStickyActivate: playFusionActivate,
    playFusionActivate: playFusionActivate,
    playFissionActivate: playFissionActivate,
    playWaveActivate: playWaveActivate,
    playWebActivate: playWebActivate,
    playBallMerge: playBallMerge,
    playPortalActivate: playPortalActivate,
    playBallTeleport: playBallTeleport,
    playFruitCollect: playFruitCollect,
    playSinkholeActivate: playSinkholeActivate,
    playSinkholeDestroy: playSinkholeDestroy,
    playSnakeActivate: playSnakeActivate,
    playSnakeEat: playSnakeEat,
    playJackpotCapture: playJackpotCapture,
    playFireworkLaunch: playFireworkLaunch,
    playFireworkBurst: playFireworkBurst,
    startMusic: startMusic,
    stopMusic: stopMusic,
    setMusicTheme: setMusicTheme,
    setMusicIntensity: setMusicIntensity,
    toggleMute: toggleMute,
    isMuted: isMuted
  };
})();
