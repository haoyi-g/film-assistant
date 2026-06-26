import { applyCubeLut, loadCubeLut } from './cubeLut'

export type ImageAdjustments = {
  lutId?: string
  lutPath?: string
  styleStrength: number
  shadowDensity: number
  colorDensity: number
  grainStrength: number

  exposure: number
  contrast: number
  shadows: number
  highlights: number
  warmth: number
  saturation: number
}

type RenderImageOptions = {
  maxRenderSize?: number
  quality?: number
}

const DEFAULT_MAX_RENDER_SIZE = 1400

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const normalizeSlider = (value: number) => clamp01(value / 100)

const normalizeSignedSlider = (value: number) =>
  Math.min(1, Math.max(-1, value / 100))

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be rendered.'))
    image.src = url
  })
}

function grainNoise(x: number, y: number): number {
  let seed = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177)
  return ((seed >>> 0) / 4294967295) * 2 - 1
}

export async function renderImageAdjustments(
  sourceUrl: string,
  adjustments: ImageAdjustments,
  options: RenderImageOptions = {},
): Promise<Blob> {
  const [image, cubeLut] = await Promise.all([
    loadImage(sourceUrl),
    adjustments.lutPath ? loadCubeLut(adjustments.lutPath) : undefined,
  ])

  const maxRenderSize = options.maxRenderSize ?? DEFAULT_MAX_RENDER_SIZE
  const quality = options.quality ?? 0.92
  const scale = Math.min(1, maxRenderSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is not available in this browser.')

  context.drawImage(image, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)
  const pixels = imageData.data

  const mix = normalizeSlider(adjustments.styleStrength)
  const shadowAmount = normalizeSlider(adjustments.shadowDensity)
  const colorAmount = normalizeSlider(adjustments.colorDensity)
  const grainAmount = normalizeSlider(adjustments.grainStrength)

  const exposure = normalizeSignedSlider(adjustments.exposure)
  const contrast = normalizeSignedSlider(adjustments.contrast)
  const shadows = normalizeSignedSlider(adjustments.shadows)
  const highlights = normalizeSignedSlider(adjustments.highlights)
  const warmth = normalizeSignedSlider(adjustments.warmth)
  const saturation = normalizeSignedSlider(adjustments.saturation)

  for (let index = 0; index < pixels.length; index += 4) {
    const pixelIndex = index / 4
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)

    const originalRed = pixels[index] / 255
    const originalGreen = pixels[index + 1] / 255
    const originalBlue = pixels[index + 2] / 255

    let red = originalRed
    let green = originalGreen
    let blue = originalBlue

    const exposureScale = 2 ** exposure
    red *= exposureScale
    green *= exposureScale
    blue *= exposureScale

    const contrastScale = 1 + contrast * 0.8
    red = (red - 0.5) * contrastScale + 0.5
    green = (green - 0.5) * contrastScale + 0.5
    blue = (blue - 0.5) * contrastScale + 0.5

    let luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    const shadowMask = (1 - clamp01(luma)) ** 2
    const shadowLift = shadows * 0.35 * shadowMask

    red += shadowLift
    green += shadowLift
    blue += shadowLift

    luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    const highlightMask = clamp01(luma) ** 2
    const highlightChange = highlights * 0.35 * highlightMask

    red += highlightChange
    green += highlightChange
    blue += highlightChange

    red += warmth * 0.08
    blue -= warmth * 0.08

    luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    const saturationScale = 1 + saturation * 0.8 + colorAmount * 0.4

    red = luma + (red - luma) * saturationScale
    green = luma + (green - luma) * saturationScale
    blue = luma + (blue - luma) * saturationScale

    if (cubeLut) {
      const beforeLutLuma = clamp01(
        0.2126 * red + 0.7152 * green + 0.0722 * blue,
      )

      const lutColor = applyCubeLut(cubeLut, red, green, blue)

      const highlightRisk = beforeLutLuma ** 3
      const shadowRisk = (1 - beforeLutLuma) ** 3
      const detailProtect = 1 - 0.45 * Math.max(highlightRisk, shadowRisk)

      const lutStrength = 0.75 * detailProtect

      red = red + (lutColor.red - red) * lutStrength
      green = green + (lutColor.green - green) * lutStrength
      blue = blue + (lutColor.blue - blue) * lutStrength
    }

    luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    const densityMask = (1 - clamp01(luma)) ** 2
    const shadowScale = 1 - 0.35 * shadowAmount * densityMask

    red *= shadowScale
    green *= shadowScale
    blue *= shadowScale

    const noise =
      grainNoise(x, y) *
      0.08 *
      grainAmount *
      (0.3 + 0.7 * (1 - clamp01(luma)))

    red = clamp01(red + noise)
    green = clamp01(green + noise)
    blue = clamp01(blue + noise)

    pixels[index] = Math.round(
      255 * clamp01(originalRed + (red - originalRed) * mix),
    )
    pixels[index + 1] = Math.round(
      255 * clamp01(originalGreen + (green - originalGreen) * mix),
    )
    pixels[index + 2] = Math.round(
      255 * clamp01(originalBlue + (blue - originalBlue) * mix),
    )
  }

  context.putImageData(imageData, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image export failed.'))),
      'image/jpeg',
      quality,
    )
  })
}
