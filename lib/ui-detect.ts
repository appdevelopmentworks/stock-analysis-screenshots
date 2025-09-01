export type UiSource = 'SBI' | 'Rakuten' | 'Matsui' | 'TradingView' | 'Unknown'

type Palette = { r: number; g: number; b: number }

function avg(p: Palette[]) {
  const s = p.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), { r: 0, g: 0, b: 0 })
  const n = Math.max(1, p.length)
  return { r: s.r / n, g: s.g / n, b: s.b / n }
}

function brightness(c: Palette) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}

function dominantChannels(pixels: Palette[]) {
  let r = 0, g = 0, b = 0
  for (const c of pixels) { r += c.r; g += c.g; b += c.b }
  const total = r + g + b || 1
  return { r: r / total, g: g / total, b: b / total }
}

async function loadImageFromFile(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = (e) => reject(e)
      el.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function detectUiSourceFromImage(file: File): Promise<UiSource> {
  try {
    const img = await loadImageFromFile(file)
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    const samples: Palette[] = []
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const i = (y * size + x) * 4
        samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
      }
    }
    const mean = avg(samples)
    const bright = brightness(mean)
    const dom = dominantChannels(samples)
    // Heuristic rules (very rough):
    // TradingView (dark): very low brightness and higher blue/green share
    if (bright < 60 && dom.b > 0.36 && dom.g > 0.30) return 'TradingView'
    // Rakuten: noticeable red accent overall on light background
    if (bright > 140 && dom.r > 0.40) return 'Rakuten'
    // SBI: light background with blue dominance
    if (bright > 140 && dom.b > 0.38 && dom.b > dom.r) return 'SBI'
    // Matsui: light gray-ish (balanced, low saturation)
    if (bright > 180 && Math.abs(dom.r - dom.g) < 0.03 && Math.abs(dom.g - dom.b) < 0.03) return 'Matsui'
    return 'Unknown'
  } catch {
    return 'Unknown'
  }
}

