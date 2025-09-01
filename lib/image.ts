export type PreprocessSettings = {
  autoCompress: boolean
  maxLongEdge: number // px
  quality: number // 0..1
}

export type ImageQuality = {
  width: number
  height: number
  longEdge: number
  fileKB: number
  blurScore: number // 0..1 lower is blurrier
}

export async function analyzeImageQuality(file: File): Promise<ImageQuality> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const width = img.naturalWidth
    const height = img.naturalHeight
    const longEdge = Math.max(width, height)
    // blur approximation: downscale to 64px, compute variance of grayscale
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    let sum = 0, sum2 = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
      sum += y
      sum2 += y * y
    }
    const n = (data.length / 4)
    const mean = sum / n
    const variance = Math.max(0, sum2 / n - mean * mean)
    // Normalize variance roughly to 0..1 range by dividing by 6500 (~max for 8-bit)
    const blurScore = Math.max(0, Math.min(1, variance / 6500))
    const fileKB = Math.round(file.size / 1024)
    return { width, height, longEdge, fileKB, blurScore }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function preprocessIfNeeded(files: File[], s: PreprocessSettings): Promise<File[]> {
  if (!s.autoCompress) return files
  const out: File[] = []
  for (const f of files) out.push(await resizeCompress(f, s.maxLongEdge, s.quality))
  return out
}

async function resizeCompress(file: File, maxLong: number, quality: number): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    let { naturalWidth: w, naturalHeight: h } = img
    const long = Math.max(w, h)
    if (long > maxLong) {
      const scale = maxLong / long
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    const type = file.type.includes('png') ? 'image/png' : 'image/jpeg'
    const dataUrl = canvas.toDataURL(type, quality)
    const nf = dataUrlToFile(dataUrl, file.name, type)
    return nf
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = url
  })
}

function dataUrlToFile(url: string, name: string, type: string): File {
  const arr = url.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || type
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new File([u8arr], name, { type: mime })
}

