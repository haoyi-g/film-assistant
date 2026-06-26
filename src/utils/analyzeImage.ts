export type AnalysisLevel = 'Low' | 'Normal' | 'High'

export type PhotoAnalysis = {
  exposure: AnalysisLevel
  contrast: AnalysisLevel
  saturation: AnalysisLevel
  shadows: 'Crushed' | 'Soft' | 'Normal' | 'Deep'
  metrics: {
    brightness: number
    contrast: number
    saturation: number
    shadowRatio: number
    highlightRatio: number
    p05: number
    p50: number
    p95: number
  }
}

const MAX_ANALYSIS_SIZE = 900

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0

  const index = (sortedValues.length - 1) * ratio
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)
  const weight = index - lowerIndex

  return (
    sortedValues[lowerIndex] * (1 - weight) +
    sortedValues[upperIndex] * weight
  )
}

function loadImage(source: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = source instanceof File ? URL.createObjectURL(source) : null

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error('The selected image could not be decoded.'))
    }

    image.src = objectUrl || (typeof source === 'string' ? source : '')
  })
}

/**
 * Analyse an image locally in the browser. No image data is uploaded.
 *
 * Luma follows Rec. 709: Y = 0.2126R + 0.7152G + 0.0722B.
 * Contrast uses the robust p95 - p05 range, so a few extreme pixels do not
 * distort the result.
 */
export async function analyzeImage(source: File | string): Promise<PhotoAnalysis> {
  const image = await loadImage(source)
  const scale = Math.min(1, MAX_ANALYSIS_SIZE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  })

  if (!context) throw new Error('Canvas is not available in this browser.')

  context.drawImage(image, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  const luminances: number[] = []
  let saturationTotal = 0
  let shadowCount = 0
  let highlightCount = 0

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] / 255
    const green = pixels[index + 1] / 255
    const blue = pixels[index + 2] / 255
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    const maxChannel = Math.max(red, green, blue)
    const minChannel = Math.min(red, green, blue)
    const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel

    luminances.push(luma)
    saturationTotal += saturation
    if (luma < 45 / 255) shadowCount += 1
    if (luma > 220 / 255) highlightCount += 1
  }

  luminances.sort((a, b) => a - b)

  const pixelCount = luminances.length
  const brightness = luminances.reduce((sum, value) => sum + value, 0) / pixelCount
  const p05 = percentile(luminances, 0.05)
  const p50 = percentile(luminances, 0.5)
  const p95 = percentile(luminances, 0.95)
  const contrastValue = p95 - p05
  const saturationValue = saturationTotal / pixelCount
  const shadowRatio = shadowCount / pixelCount
  const highlightRatio = highlightCount / pixelCount

  const exposure: AnalysisLevel =
    p50 < 0.34 ? 'Low' : p50 > 0.7 || highlightRatio > 0.28 ? 'High' : 'Normal'

  const contrast: AnalysisLevel =
    contrastValue < 0.3 ? 'Low' : contrastValue > 0.62 ? 'High' : 'Normal'

  const saturation: AnalysisLevel =
    saturationValue < 0.18 ? 'Low' : saturationValue > 0.48 ? 'High' : 'Normal'

  const shadows: PhotoAnalysis['shadows'] =
    shadowRatio > 0.32 && p05 < 0.025
      ? 'Crushed'
      : shadowRatio > 0.24
        ? 'Deep'
        : contrastValue < 0.36
          ? 'Soft'
          : 'Normal'

  const round = (value: number) => Number(value.toFixed(4))

  return {
    exposure,
    contrast,
    saturation,
    shadows,
    metrics: {
      brightness: round(brightness),
      contrast: round(contrastValue),
      saturation: round(saturationValue),
      shadowRatio: round(shadowRatio),
      highlightRatio: round(highlightRatio),
      p05: round(p05),
      p50: round(p50),
      p95: round(p95),
    },
  }
}
