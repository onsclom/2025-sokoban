const audioCtx = new AudioContext();
const sampleRate = audioCtx.sampleRate;

const stepSoundBuffer = (function () {
  const duration = 0.1; // seconds
  const frequency = 200; // Hz
  const length = sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    // linear taper off
    const volume = 1 - time / duration;
    data[i] = Math.sin(2 * Math.PI * frequency * time) * volume;
  }
  return buffer;
})();

export function playStepSound() {
  // slightly randomize pitch
  const pitchVariation = Math.random() * 0.2 - 0.1;
  const source = audioCtx.createBufferSource();
  source.buffer = stepSoundBuffer;
  source.playbackRate.value = 1 + pitchVariation;
  source.connect(audioCtx.destination);
  source.start();
}
