const audioCtx = new AudioContext();
const sampleRate = audioCtx.sampleRate;

const stepSoundBuffer = (function () {
  const duration = 0.025; // seconds
  const frequency = 50; // Hz
  const length = sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // Low-pass filter state for brown noise
  let lastNoise = 0;
  const filterStrength = 0.75; // Higher = more filtering of high frequencies

  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    // linear taper off
    const volume = 1 - time / duration;

    // Mix sine wave with filtered noise (brown noise)
    const sineWave = Math.sin(2 * Math.PI * frequency * time);

    // Create brown noise by low-pass filtering white noise
    const whiteNoise = Math.random() * 2 - 1;
    const brownNoise =
      (lastNoise * filterStrength + whiteNoise * (1 - filterStrength)) * 0.3;
    lastNoise = brownNoise / 0.3; // Store unscaled value for next iteration

    data[i] = (sineWave * 0.7 + brownNoise) * volume;
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

const invalidMoveSoundBuffer = (function () {
  // saw wave that tapers in volume and pitch
  const duration = 0.2;
  const frequency = 100; // Hz
  const length = sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    const volume = 1 - time / duration;
    // saw wave formula
    const sawWave = 2 * (time * frequency - Math.floor(0.5 + time * frequency));
    data[i] = sawWave * volume * 0.3; // lower volume
  }
  return buffer;
})();

export function playInvalidMoveSound() {
  // slightly randomize pitch
  const pitchVariation = Math.random() * 0.2 - 0.1;
  const source = audioCtx.createBufferSource();
  source.buffer = invalidMoveSoundBuffer;
  source.playbackRate.value = 1 + pitchVariation;
  source.connect(audioCtx.destination);
  source.start();
}
