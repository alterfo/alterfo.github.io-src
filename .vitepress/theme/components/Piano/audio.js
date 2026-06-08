import { ref } from 'vue'

function velocityToTone(v) {
  return Math.pow(v / 127, 1.5)
}

export function usePianoAudio() {
  const mode = ref('synth')
  const samplerReady = ref(false)
  const samplerLoading = ref(false)

  let _synth = null
  let _sampler = null
  let _chain = null  // [eq, comp, reverb, limiter]
  let _chainPromise = null  // deduplicates concurrent _buildChain calls
  let _Tone = null
  let _disposed = false

  async function _ensureTone() {
    if (_Tone) return _Tone
    _Tone = await import('tone')
    return _Tone
  }

  async function _buildChain(T) {
    const eq = new T.EQ3({ low: -3, mid: 0, high: 3 })
    const comp = new T.Compressor({ threshold: -24, ratio: 3, attack: 0.003, release: 0.25, knee: 6 })
    const reverb = new T.Reverb({ decay: 2.0, preDelay: 0.02, wet: 0.22 })
    const limiter = new T.Limiter(-2)
    eq.chain(comp, reverb, limiter, T.getDestination())
    await reverb.ready
    _chain = [eq, comp, reverb, limiter]
    return eq
  }

  async function _getOrBuildChain(T) {
    if (_chain) return _chain[0]
    if (!_chainPromise) _chainPromise = _buildChain(T).finally(() => { _chainPromise = null })
    return _chainPromise
  }

  async function _ensureSynth() {
    if (_synth) return
    const T = await _ensureTone()
    await T.start()
    const dest = await _getOrBuildChain(T)
    if (_synth) return  // another concurrent call already built the synth
    _synth = new T.PolySynth(T.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.15, release: 1.5 },
      volume: -8,
    })
    _synth.connect(dest)
  }

  async function loadSampler() {
    if (mode.value === 'sampler' || samplerLoading.value) return
    samplerLoading.value = true
    const T = await _ensureTone()
    await T.start()
    const dest = await _getOrBuildChain(T)
    return new Promise((resolve, reject) => {
      _sampler = new T.Sampler({
        urls: {
          A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3', A1: 'A1.mp3',
          C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3', C3: 'C3.mp3',
          'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3',
          'F#4': 'Fs4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
          A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3', A6: 'A6.mp3',
          C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3', A7: 'A7.mp3', C8: 'C8.mp3',
        },
        baseUrl: '/audio/salamander/',
        onload: () => {
          if (_disposed) return
          samplerReady.value = true
          samplerLoading.value = false
          mode.value = 'sampler'
          resolve()
        },
        onerror: (err) => {
          samplerLoading.value = false
          _sampler = null
          reject(err)
        },
      })
      _sampler.connect(dest)
    })
  }

  async function playNote(midi, velocity = 80) {
    try {
      const T = await _ensureTone()
      const noteName = T.Frequency(midi, 'midi').toNote()
      const vel = velocityToTone(velocity)
      if (mode.value === 'sampler' && _sampler && samplerReady.value) {
        _sampler.triggerAttack(noteName, T.now(), vel)
      } else {
        await _ensureSynth()
        _synth.triggerAttack(noteName, T.now(), vel)
      }
    } catch {
      // AudioContext may not be available server-side or before user gesture
    }
  }

  async function releaseNote(midi) {
    try {
      const T = await _ensureTone()
      const noteName = T.Frequency(midi, 'midi').toNote()
      if (mode.value === 'sampler' && _sampler && samplerReady.value) {
        _sampler.triggerRelease(noteName, T.now())
      } else if (_synth) {
        _synth.triggerRelease(noteName, T.now())
      }
    } catch {
      // ignore
    }
  }

  function dispose() {
    _disposed = true
    if (_synth) { _synth.dispose(); _synth = null }
    if (_sampler) { _sampler.dispose(); _sampler = null }
    if (_chain) { _chain.forEach(n => n.dispose()); _chain = null }
    mode.value = 'synth'
    samplerReady.value = false
    samplerLoading.value = false
  }

  return { mode, samplerReady, samplerLoading, playNote, releaseNote, loadSampler, dispose }
}
