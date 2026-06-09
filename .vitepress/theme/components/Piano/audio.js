import { ref } from 'vue'

function velocityToTone(v) {
  return Math.pow(v / 127, 1.5)
}

export function usePianoAudio() {
  const mode = ref('synth')
  const samplerReady = ref(false)
  const samplerLoading = ref(false)
  const audioReady = ref(false)  // true once AudioContext is running

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
    // Softer compressor: -24dB/-3 caused gain pumping on reverb tails → audible hum
    const comp = new T.Compressor({ threshold: -18, ratio: 2, attack: 0.02, release: 0.3, knee: 10 })
    // Shorter/dryer reverb: 2.0s/0.22 wet fed into the compressor and produced artefacts
    const reverb = new T.Reverb({ decay: 1.2, preDelay: 0.015, wet: 0.12 })
    const limiter = new T.Limiter(-2)
    eq.chain(comp, reverb, limiter, T.getDestination())
    try {
      await reverb.ready
    } catch (err) {
      ;[eq, comp, reverb, limiter].forEach(n => n.dispose())
      throw err
    }
    if (_disposed) {
      ;[eq, comp, reverb, limiter].forEach(n => n.dispose())
      throw new Error('disposed')
    }
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
    // triangle (not triangle8): 8-harmonic partial synthesis produces a higher noise floor
    _synth = new T.PolySynth(T.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.15, release: 1.5 },
      volume: -8,
    })
    _synth.connect(dest)
  }

  async function loadSampler() {
    if (_disposed) return
    if (mode.value === 'sampler' || samplerLoading.value) return
    samplerLoading.value = true
    let T, dest
    try {
      T = await _ensureTone()
      await T.start()
      dest = await _getOrBuildChain(T)
    } catch (err) {
      samplerLoading.value = false
      throw err
    }
    // Preflight: verify at least one sample file is reachable before constructing
    // the Sampler. Tone.js may call onload even when all fetches 404, leaving
    // mode='sampler' but with empty buffers (silent notes).
    try {
      const probe = await fetch('/audio/salamander/A0.mp3', { method: 'HEAD' })
      if (!probe.ok) {
        samplerLoading.value = false
        throw new Error('Файлы Salamander не найдены в /audio/salamander/. Скачайте Salamander Grand Piano mp3 и поместите в public/audio/salamander/')
      }
    } catch (e) {
      if (e.message.includes('Salamander')) { throw e }
      // Network/CORS error on preflight — proceed and let Sampler handle it
    }
    return new Promise((resolve, reject) => {
      if (_disposed) { samplerLoading.value = false; reject(new Error('disposed')); return }
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
          if (_disposed) { samplerLoading.value = false; reject(new Error('disposed')); return }
          // Silence the synth before switching mode so stuck notes don't drone through the chain
          if (_synth) _synth.releaseAll()
          samplerReady.value = true
          samplerLoading.value = false
          mode.value = 'sampler'
          resolve()
        },
        onerror: (err) => {
          samplerLoading.value = false
          _sampler = null
          reject(_disposed ? new Error('disposed') : err)
        },
      })
      _sampler.connect(dest)
    })
  }

  async function playNote(midi, velocity = 80) {
    if (_disposed) return
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
    if (_disposed) return
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

  // Must be called from a user gesture (click/keydown) so AudioContext can start.
  // Web MIDI events are NOT considered user gestures by Chrome/Firefox for AudioContext.
  // Pre-builds the signal chain so that Reverb IR generation (which can produce a brief
  // pop/hum) happens silently on first user click rather than during HD sampler load.
  async function unlockAudio() {
    if (_disposed) return
    try {
      const T = await _ensureTone()
      await T.start()
      audioReady.value = true
      _getOrBuildChain(T)  // fire-and-forget: builds EQ→Comp→Reverb→Limiter in background
    } catch { /* ignore — may fail without a user gesture */ }
  }

  function releaseAll() {
    if (_synth) _synth.releaseAll()
    if (_sampler && samplerReady.value) try { _sampler.releaseAll() } catch {}
  }

  function dispose() {
    _disposed = true
    _chainPromise = null
    if (_synth) { _synth.dispose(); _synth = null }
    if (_sampler) { _sampler.dispose(); _sampler = null }
    if (_chain) { _chain.forEach(n => n.dispose()); _chain = null }
    mode.value = 'synth'
    samplerReady.value = false
    samplerLoading.value = false
  }

  return { mode, samplerReady, samplerLoading, audioReady, playNote, releaseNote, releaseAll, loadSampler, unlockAudio, dispose }
}
