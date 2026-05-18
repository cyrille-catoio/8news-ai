/**
 * Short two-tone notification beep used by the SPA when news fetch
 * finishes successfully. Exposes the user-gesture audio unlock plus
 * the actual beep — kept as a module-level singleton AudioContext so
 * subsequent calls reuse the same context (browsers typically allow
 * only a handful before throttling).
 *
 * v2.12 extracted from `src/app/app/page.tsx`. Behavior is unchanged.
 */

let sharedAudioCtx: AudioContext | null = null;

/**
 * Lazily create / resume the shared AudioContext. Must be called from
 * a user-gesture handler (click) on iOS / Safari which gates new
 * AudioContexts on user interaction.
 */
export function unlockAudioContext(): void {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioContext();
    }
    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume();
    }
    const buf = sharedAudioCtx.createBuffer(1, 1, 22050);
    const src = sharedAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(sharedAudioCtx.destination);
    src.start(0);
  } catch { /* silent fail */ }
}

/** Two-tone beep (880 Hz then 1050 Hz) used as a « done » cue. */
export function playNotificationBeep(): void {
  try {
    const ctx = sharedAudioCtx;
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state === "suspended") ctx.resume();

    const t0 = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.frequency.value = 880;
    osc1.type = "sine";
    osc1.connect(gain);
    osc1.start(t0);
    osc1.stop(t0 + 0.12);

    const osc2 = ctx.createOscillator();
    osc2.frequency.value = 1050;
    osc2.type = "sine";
    osc2.connect(gain);
    osc2.start(t0 + 0.18);
    osc2.stop(t0 + 0.30);

    gain.gain.setValueAtTime(0.08, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    gain.gain.setValueAtTime(0.08, t0 + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.30);
  } catch { /* silent fail */ }
}
