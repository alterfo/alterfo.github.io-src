// Мелкая сеть для демо на главной pro-сайта: 2 входа, tanh-слои, softmax.
// Всё считается в браузере, без загрузок моделей. Чистые функции — тестируются
// в neural.test.mjs.

export function makeRng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9)
  const v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function makeDataset(kind = 'spirals', n = 360, seed = 11) {
  const rnd = makeRng(seed)
  const half = Math.floor(n / 2)
  const X = new Float64Array(n * 2)
  const Y = new Int32Array(n)

  for (let i = 0; i < n; i++) {
    const cls = i < half ? 0 : 1
    const k = i < half ? i : i - half
    const t = (k + 0.5) / half
    let x = 0
    let y = 0

    if (kind === 'moons') {
      const a = Math.PI * t
      x = Math.cos(a) * 0.78
      y = Math.sin(a) * 0.78 - (cls ? -0.18 : 0.18)
      if (cls) x = -x
      x += gauss(rnd) * 0.055
      y += gauss(rnd) * 0.055
    } else if (kind === 'circles') {
      const a = rnd() * Math.PI * 2
      const r = cls ? 0.62 + rnd() * 0.26 : rnd() * 0.3
      x = Math.cos(a) * r
      y = Math.sin(a) * r
    } else {
      const a = 1.55 * Math.PI * t + cls * Math.PI + gauss(rnd) * 0.16
      const r = 0.1 + 0.86 * t
      x = Math.cos(a) * r + gauss(rnd) * 0.045
      y = Math.sin(a) * r + gauss(rnd) * 0.045
    }

    X[i * 2] = x
    X[i * 2 + 1] = y
    Y[i] = cls
  }

  return { X, Y, n, kind }
}

export function createNet(sizes = [2, 16, 16, 2], seed = 7) {
  const rnd = makeRng(seed)
  const layers = []
  for (let l = 0; l < sizes.length - 1; l++) {
    const fanIn = sizes[l]
    const fanOut = sizes[l + 1]
    const scale = Math.sqrt(2 / (fanIn + fanOut)) * 1.8
    const w = new Float64Array(fanIn * fanOut)
    for (let i = 0; i < w.length; i++) w[i] = gauss(rnd) * scale
    layers.push({ w, b: new Float64Array(fanOut), fanIn, fanOut })
  }
  return { sizes, layers }
}

export function createAdam(net) {
  return {
    t: 0,
    m: net.layers.map((l) => ({ w: new Float64Array(l.w.length), b: new Float64Array(l.b.length) })),
    v: net.layers.map((l) => ({ w: new Float64Array(l.w.length), b: new Float64Array(l.b.length) })),
  }
}

function logitsOf(net, x) {
  let a = x
  for (let l = 0; l < net.layers.length; l++) {
    const { w, b, fanIn, fanOut } = net.layers[l]
    const out = new Float64Array(fanOut)
    for (let o = 0; o < fanOut; o++) {
      let s = b[o]
      const base = o * fanIn
      for (let i = 0; i < fanIn; i++) s += w[base + i] * a[i]
      out[o] = s
    }
    if (l < net.layers.length - 1) {
      for (let o = 0; o < fanOut; o++) out[o] = Math.tanh(out[o])
    }
    a = out
  }
  return a
}

function softmax2(z) {
  const m = Math.max(z[0], z[1])
  const e0 = Math.exp(z[0] - m)
  const e1 = Math.exp(z[1] - m)
  const s = e0 + e1
  return [e0 / s, e1 / s]
}

export function predict(net, x, y) {
  const [p0, p1] = softmax2(logitsOf(net, [x, y]))
  return p1
}

export function evaluate(net, ds) {
  let loss = 0
  let correct = 0
  for (let i = 0; i < ds.n; i++) {
    const p = Math.max(1e-7, predict(net, ds.X[i * 2], ds.X[i * 2 + 1]))
    const label = ds.Y[i]
    loss += -(label ? Math.log(p) : Math.log(1 - p))
    if ((p > 0.5 ? 1 : 0) === label) correct++
  }
  return { loss: loss / ds.n, acc: correct / ds.n }
}

export function trainEpoch(net, ds, lr, adam) {
  const gw = net.layers.map((l) => new Float64Array(l.w.length))
  const gb = net.layers.map((l) => new Float64Array(l.b.length))
  let loss = 0

  for (let s = 0; s < ds.n; s++) {
    const x = [ds.X[s * 2], ds.X[s * 2 + 1]]
    const label = ds.Y[s]

    const acts = [x]
    let a = x
    for (let l = 0; l < net.layers.length; l++) {
      const { w, b, fanIn, fanOut } = net.layers[l]
      const z = new Float64Array(fanOut)
      for (let o = 0; o < fanOut; o++) {
        let sum = b[o]
        const base = o * fanIn
        for (let i = 0; i < fanIn; i++) sum += w[base + i] * a[i]
        z[o] = sum
      }
      const last = l === net.layers.length - 1
      a = new Float64Array(fanOut)
      for (let o = 0; o < fanOut; o++) a[o] = last ? z[o] : Math.tanh(z[o])
      acts.push(a)
    }

    const probs = softmax2(acts[acts.length - 1])
    const target = label
    loss += -Math.log(Math.max(1e-7, target ? probs[1] : probs[0]))

    let delta = new Float64Array(2)
    delta[0] = probs[0] - (target ? 0 : 1)
    delta[1] = probs[1] - (target ? 1 : 0)

    for (let l = net.layers.length - 1; l >= 0; l--) {
      const { fanIn, fanOut } = net.layers[l]
      const prev = acts[l]
      for (let o = 0; o < fanOut; o++) {
        gb[l][o] += delta[o]
        const base = o * fanIn
        for (let i = 0; i < fanIn; i++) gw[l][base + i] += delta[o] * prev[i]
      }
      if (l > 0) {
        const next = new Float64Array(fanIn)
        const w = net.layers[l].w
        for (let i = 0; i < fanIn; i++) {
          let sum = 0
          for (let o = 0; o < fanOut; o++) sum += w[o * fanIn + i] * delta[o]
          next[i] = sum * (1 - prev[i] * prev[i])
        }
        delta = next
      }
    }
  }

  const b1 = 0.9
  const b2 = 0.999
  const eps = 1e-8
  adam.t++
  const c1 = 1 - Math.pow(b1, adam.t)
  const c2 = 1 - Math.pow(b2, adam.t)

  for (let l = 0; l < net.layers.length; l++) {
    const { w, b } = net.layers[l]
    const m = adam.m[l]
    const v = adam.v[l]
    for (let i = 0; i < w.length; i++) {
      const g = gw[l][i] / ds.n
      m.w[i] = b1 * m.w[i] + (1 - b1) * g
      v.w[i] = b2 * v.w[i] + (1 - b2) * g * g
      w[i] -= (lr * (m.w[i] / c1)) / (Math.sqrt(v.w[i] / c2) + eps)
    }
    for (let i = 0; i < b.length; i++) {
      const g = gb[l][i] / ds.n
      m.b[i] = b1 * m.b[i] + (1 - b1) * g
      v.b[i] = b2 * v.b[i] + (1 - b2) * g * g
      b[i] -= (lr * (m.b[i] / c1)) / (Math.sqrt(v.b[i] / c2) + eps)
    }
  }

  return loss / ds.n
}

export function frame(net, w, h) {
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const py = 1 - (2 * (y + 0.5)) / h
    for (let x = 0; x < w; x++) {
      const px = (2 * (x + 0.5)) / w - 1
      out[y * w + x] = predict(net, px, py)
    }
  }
  return out
}
