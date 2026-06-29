import { applyCubeLut, loadCubeLut } from './cubeLut'

export const HSL_COLOR_KEYS = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
] as const

export type HslColorKey = (typeof HSL_COLOR_KEYS)[number]
export type HslChannelAdjustment = {
  hue: number
  saturation: number
  luminance: number
}
export type HslAdjustments = Record<HslColorKey, HslChannelAdjustment>

export const createDefaultHslAdjustments = (): HslAdjustments =>
  Object.fromEntries(
    HSL_COLOR_KEYS.map((color) => [
      color,
      { hue: 0, saturation: 0, luminance: 0 },
    ]),
  ) as HslAdjustments

export type ColorGradingZone = {
  hue: number
  saturation: number
  luminance: number
}

export type ColorGradingAdjustments = {
  shadows: ColorGradingZone
  midtones: ColorGradingZone
  highlights: ColorGradingZone
  balance: number
  blending: number
}

export const createDefaultColorGrading = (): ColorGradingAdjustments => ({
  shadows: { hue: 210, saturation: 0, luminance: 0 },
  midtones: { hue: 30, saturation: 0, luminance: 0 },
  highlights: { hue: 40, saturation: 0, luminance: 0 },
  balance: 0,
  blending: 50,
})

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
  hsl: HslAdjustments
  colorGrading: ColorGradingAdjustments
  localMasks: Array<{
    maskUrl: string
    visible: boolean
    adjustments: {
      exposure: number
      contrast: number
      shadows: number
      highlights: number
      warmth: number
      saturation: number
    }
  }>
}

type RenderImageOptions = {
  maxRenderSize?: number
  quality?: number
}

const DEFAULT_MAX_RENDER_SIZE = 1400

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const normalizeSlider = (value: number) => clamp01(value / 100)

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = clamp01((value - edge0) / (edge1 - edge0))
  return amount * amount * (3 - 2 * amount)
}

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

function rgbToHsl(red: number, green: number, blue: number) {
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const difference = maximum - minimum
  const luminance = (maximum + minimum) / 2
  let hue = 0

  if (difference !== 0) {
    if (maximum === red) hue = ((green - blue) / difference) % 6
    else if (maximum === green) hue = (blue - red) / difference + 2
    else hue = (red - green) / difference + 4
    hue /= 6
    if (hue < 0) hue += 1
  }

  const saturation =
    difference === 0 ? 0 : difference / (1 - Math.abs(2 * luminance - 1))
  return { hue, saturation, luminance }
}

function hslToRgb(hue: number, saturation: number, luminance: number) {
  const wrappedHue = ((hue % 1) + 1) % 1
  const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation
  const section = wrappedHue * 6
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1))
  let red = 0
  let green = 0
  let blue = 0

  if (section < 1) [red, green] = [chroma, intermediate]
  else if (section < 2) [red, green] = [intermediate, chroma]
  else if (section < 3) [green, blue] = [chroma, intermediate]
  else if (section < 4) [green, blue] = [intermediate, chroma]
  else if (section < 5) [red, blue] = [intermediate, chroma]
  else [red, blue] = [chroma, intermediate]

  const match = luminance - chroma / 2
  return { red: red + match, green: green + match, blue: blue + match }
}

const HSL_COLOR_CENTERS: Record<HslColorKey, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 240,
  purple: 280,
  magenta: 320,
}

function applyHslMixer(
  red: number,
  green: number,
  blue: number,
  adjustments: HslAdjustments,
) {
  const hsl = rgbToHsl(clamp01(red), clamp01(green), clamp01(blue))
  const hueDegrees = hsl.hue * 360
  let totalWeight = 0
  let hueChange = 0
  let saturationChange = 0
  let luminanceChange = 0

  for (const color of HSL_COLOR_KEYS) {
    const rawDistance = Math.abs(hueDegrees - HSL_COLOR_CENTERS[color])
    const distance = Math.min(rawDistance, 360 - rawDistance)
    const weight = Math.max(0, 1 - distance / 50)
    if (!weight) continue

    totalWeight += weight
    hueChange += adjustments[color].hue * weight
    saturationChange += adjustments[color].saturation * weight
    luminanceChange += adjustments[color].luminance * weight
  }

  if (!totalWeight || hsl.saturation < 0.01) return { red, green, blue }

  const colorPresence = clamp01(hsl.saturation * 5)
  const shadowChromaProtection =
    0.18 + 0.82 * smoothstep(0.025, 0.2, hsl.luminance)
  const averageLuminanceChange = luminanceChange / totalWeight
  const darkeningProtection =
    averageLuminanceChange < 0
      ? 0.1 + 0.9 * smoothstep(0.04, 0.28, hsl.luminance)
      : 1
  const nextHue =
    hsl.hue +
    (hueChange / totalWeight / 100) *
      (30 / 360) *
      colorPresence *
      shadowChromaProtection
  const nextSaturation = clamp01(
    hsl.saturation +
      (saturationChange / totalWeight / 100) *
        0.5 *
        colorPresence *
        shadowChromaProtection,
  )
  const nextLuminance = clamp01(
    hsl.luminance +
      (averageLuminanceChange / 100) *
        0.35 *
        colorPresence *
        darkeningProtection,
  )

  return hslToRgb(nextHue, nextSaturation, nextLuminance)
}

function applyColorGrading(
  red: number,
  green: number,
  blue: number,
  grading: ColorGradingAdjustments,
) {
  const luma = clamp01(0.2126 * red + 0.7152 * green + 0.0722 * blue)
  const balancedLuma = clamp01(luma - (grading.balance / 100) * 0.2)
  const width = 0.1 + (clamp01(grading.blending / 100) * 0.18)
  const gaussian = (center: number) =>
    Math.exp(-((balancedLuma - center) ** 2) / (2 * width ** 2))

  const zones: Array<[
    'shadows' | 'midtones' | 'highlights',
    ColorGradingZone,
    number,
  ]> = [
    ['shadows', grading.shadows, gaussian(0.15)],
    ['midtones', grading.midtones, gaussian(0.5)],
    ['highlights', grading.highlights, gaussian(0.85)],
  ]

  for (const [zoneName, zone, mask] of zones) {
    if (zone.saturation !== 0) {
      const tint = hslToRgb(zone.hue / 360, 1, 0.5)
      const tintLuma =
        0.2126 * tint.red + 0.7152 * tint.green + 0.0722 * tint.blue

      // Deep shadows contain very little colour information. Strong chroma
      // there reveals sensor noise and JPEG blocks, so gradually protect it.
      const deepShadowProtection =
        zoneName === 'shadows' ? 0.12 + 0.88 * smoothstep(0.025, 0.2, luma) : 1

      // Keep low values precise while gently compressing extreme saturation.
      const safeSaturation = Math.tanh((zone.saturation / 100) * 1.4) / 1.4
      const strength = safeSaturation * mask * 0.38 * deepShadowProtection

      // Add chroma around the tint's luminance to preserve image detail.
      red += (tint.red - tintLuma) * strength
      green += (tint.green - tintLuma) * strength
      blue += (tint.blue - tintLuma) * strength
    }

    const luminanceChange = (zone.luminance / 100) * mask * 0.25
    red += luminanceChange
    green += luminanceChange
    blue += luminanceChange
  }

  return { red, green, blue }
}

export async function renderImageAdjustments(
  sourceUrl: string,
  adjustments: ImageAdjustments,
  options: RenderImageOptions = {},
): Promise<Blob> {
  const [image, cubeLut, localMaskImages] = await Promise.all([
    loadImage(sourceUrl),
    adjustments.lutPath ? loadCubeLut(adjustments.lutPath) : undefined,
    Promise.all(
      adjustments.localMasks.map((mask) =>
        mask.visible && mask.maskUrl ? loadImage(mask.maskUrl) : undefined,
      ),
    ),
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
  const localMaskLayers = localMaskImages.map((maskImage, layerIndex) => {
    if (!maskImage) return undefined
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = width
    maskCanvas.height = height
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
    if (maskContext) {
      maskContext.drawImage(maskImage, 0, 0, width, height)
      return {
        pixels: maskContext.getImageData(0, 0, width, height).data,
        adjustments: adjustments.localMasks[layerIndex].adjustments,
      }
    }
    return undefined
  })

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

    for (const localLayer of localMaskLayers) {
      if (!localLayer) continue
      const localMask = localLayer.pixels[index + 3] / 255
      if (localMask <= 0) continue
      const beforeLocalRed = red
      const beforeLocalGreen = green
      const beforeLocalBlue = blue
      const local = localLayer.adjustments
      const localExposure = 2 ** normalizeSignedSlider(local.exposure)
      red *= localExposure
      green *= localExposure
      blue *= localExposure

      const localContrast = 1 + normalizeSignedSlider(local.contrast) * 0.8
      red = (red - 0.5) * localContrast + 0.5
      green = (green - 0.5) * localContrast + 0.5
      blue = (blue - 0.5) * localContrast + 0.5

      let localLuma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      const localShadowMask = (1 - clamp01(localLuma)) ** 2
      const localShadowChange =
        normalizeSignedSlider(local.shadows) * 0.35 * localShadowMask
      red += localShadowChange
      green += localShadowChange
      blue += localShadowChange

      localLuma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      const localHighlightMask = clamp01(localLuma) ** 2
      const localHighlightChange =
        normalizeSignedSlider(local.highlights) * 0.35 * localHighlightMask
      red += localHighlightChange
      green += localHighlightChange
      blue += localHighlightChange

      const localWarmth = normalizeSignedSlider(local.warmth) * 0.08
      red += localWarmth
      blue -= localWarmth

      localLuma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      const localSaturation =
        1 + normalizeSignedSlider(local.saturation) * 0.8
      red = localLuma + (red - localLuma) * localSaturation
      green = localLuma + (green - localLuma) * localSaturation
      blue = localLuma + (blue - localLuma) * localSaturation

      red = beforeLocalRed + (red - beforeLocalRed) * localMask
      green = beforeLocalGreen + (green - beforeLocalGreen) * localMask
      blue = beforeLocalBlue + (blue - beforeLocalBlue) * localMask
    }

    const hslColor = applyHslMixer(red, green, blue, adjustments.hsl)
    red = hslColor.red
    green = hslColor.green
    blue = hslColor.blue

    const gradedColor = applyColorGrading(
      red,
      green,
      blue,
      adjustments.colorGrading,
    )
    red = gradedColor.red
    green = gradedColor.green
    blue = gradedColor.blue

    if (cubeLut) {
      const beforeLutLuma = clamp01(
        0.2126 * red + 0.7152 * green + 0.0722 * blue,
      )

      const lutColor = applyCubeLut(cubeLut, red, green, blue)

      const highlightRisk = beforeLutLuma ** 3
      const shadowRisk = (1 - beforeLutLuma) ** 3
      const detailProtect = 1 - 0.45 * Math.max(highlightRisk, shadowRisk)

      // Style Strength controls only the LUT layer. Manual exposure, contrast,
      // shadows and the other execution controls remain independent.
      const lutStrength = mix * 0.75 * detailProtect

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

    pixels[index] = Math.round(255 * clamp01(red))
    pixels[index + 1] = Math.round(255 * clamp01(green))
    pixels[index + 2] = Math.round(255 * clamp01(blue))
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
