import { ref, onUnmounted } from 'vue'

// MIDI note number → { name, octave, accidental }
export function midiToNote(num) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const pitchClass = num % 12
  const octave = Math.floor(num / 12) - 1
  const name = names[pitchClass]
  return { num, name, octave, pitchClass, accidental: name.includes('#') }
}

// MIDI note name (e.g. "C4") → MIDI number
export function noteNameToMidi(name) {
  const match = name.match(/^([A-G]#?b?)(-?\d+)$/)
  if (!match) return null
  const noteMap = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
  const pc = noteMap[match[1]]
  if (pc === undefined) return null
  return (parseInt(match[2]) + 1) * 12 + pc
}

// Composable for MIDI input in a Vue component
export function useMidi() {
  const status = ref('checking')   // 'checking' | 'unsupported' | 'no-device' | 'connected'
  const deviceName = ref('')
  const pressedNotes = ref(new Set())  // Set of MIDI numbers currently held

  let _midiAccess = null
  const _listeners = new Map()

  function _onMidiMessage(msg) {
    const [status_, note, velocity] = msg.data
    const cmd = status_ & 0xf0
    if (cmd === 0x90 && velocity > 0) {
      pressedNotes.value = new Set([...pressedNotes.value, note])
    } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
      const next = new Set(pressedNotes.value)
      next.delete(note)
      pressedNotes.value = next
    }
  }

  function _bindInputs() {
    if (!_midiAccess) return
    let found = false
    for (const input of _midiAccess.inputs.values()) {
      if (!_listeners.has(input.id)) {
        input.onmidimessage = _onMidiMessage
        _listeners.set(input.id, input)
        if (!found) { deviceName.value = input.name; found = true }
      }
    }
    status.value = found ? 'connected' : 'no-device'
    if (!found) deviceName.value = ''
  }

  async function init() {
    if (!navigator.requestMIDIAccess) { status.value = 'unsupported'; return }
    try {
      _midiAccess = await navigator.requestMIDIAccess({ sysex: false })
      _bindInputs()
      _midiAccess.onstatechange = _bindInputs
    } catch {
      status.value = 'unsupported'
    }
  }

  function dispose() {
    for (const input of _listeners.values()) input.onmidimessage = null
    _listeners.clear()
    _midiAccess = null
    pressedNotes.value = new Set()
  }

  return { status, deviceName, pressedNotes, init, dispose }
}
