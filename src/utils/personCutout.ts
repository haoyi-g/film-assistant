import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

export type SkinToneAdjustments = {
  warmth: number
  tint: number
  saturation: number
  luminance: number
}

let segmenterPromise: Promise<ImageSegmenter> | null = null

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The photo could not be loaded for person detection.'))
    image.src = url
  })
}

function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = FilesetResolver.forVisionTasks('/mediapipe/wasm').then(
      (vision) =>
        ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/models/selfie_multiclass_256x256.tflite',
          },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: true,
        }),
    )
  }
  return segmenterPromise
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smoothstep = (minimum: number, maximum: number, value: number) => {
  const amount = clamp01((value - minimum) / (maximum - minimum))
  return amount * amount * (3 - 2 * amount)
}

export async function createPersonCutout(
  sourceUrl: string,
  skinTone: SkinToneAdjustments = {
    warmth: 0,
    tint: 0,
    saturation: 0,
    luminance: 0,
  },
  backgroundUrl?: string,
): Promise<Blob> {
  const [image, background, segmenter] = await Promise.all([
    loadImage(sourceUrl),
    backgroundUrl ? loadImage(backgroundUrl) : loadImage(sourceUrl),
    getSegmenter(),
  ])
  const result = segmenter.segment(image)
  const confidenceMasks = result.confidenceMasks
  const categoryMask = result.categoryMask

  if (!confidenceMasks?.length && !categoryMask) {
    throw new Error('No person mask was returned by the detection model.')
  }

  const referenceMask = confidenceMasks?.[0] ?? categoryMask!
  const maskWidth = referenceMask.width
  const maskHeight = referenceMask.height
  const categoryData = categoryMask?.getAsUint8Array()
  const confidenceData = confidenceMasks?.map((mask) => mask.getAsFloat32Array())

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = maskWidth
  maskCanvas.height = maskHeight
  const maskContext = maskCanvas.getContext('2d')
  if (!maskContext) throw new Error('Canvas is unavailable for person detection.')
  const maskImage = maskContext.createImageData(maskWidth, maskHeight)

  for (let index = 0; index < maskWidth * maskHeight; index += 1) {
    const category = categoryData?.[index] ?? 0
    const personConfidence = confidenceData
      ? clamp01(1 - confidenceData[0][index])
      : category === 0
        ? 0
        : 1
    // Multiclass labels: 2 body skin, 3 face skin.
    const skinConfidence = confidenceData?.[2] && confidenceData?.[3]
      ? clamp01(confidenceData[2][index] + confidenceData[3][index])
      : category === 2 || category === 3
        ? 1
        : 0
    const pixel = index * 4
    maskImage.data[pixel] = Math.round(personConfidence * 255)
    maskImage.data[pixel + 1] = Math.round(skinConfidence * 255)
    maskImage.data[pixel + 2] = 0
    maskImage.data[pixel + 3] = 255
  }
  maskContext.putImageData(maskImage, 0, 0)

  const output = document.createElement('canvas')
  output.width = image.naturalWidth
  output.height = image.naturalHeight
  const context = output.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable for background removal.')
  context.drawImage(image, 0, 0)
  const imageData = context.getImageData(0, 0, output.width, output.height)

  const backgroundCanvas = document.createElement('canvas')
  backgroundCanvas.width = output.width
  backgroundCanvas.height = output.height
  const backgroundContext = backgroundCanvas.getContext('2d', {
    willReadFrequently: true,
  })
  if (!backgroundContext) throw new Error('Canvas is unavailable for compositing.')
  backgroundContext.drawImage(background, 0, 0, output.width, output.height)
  const backgroundData = backgroundContext.getImageData(
    0,
    0,
    output.width,
    output.height,
  ).data

  const scaledMaskCanvas = document.createElement('canvas')
  scaledMaskCanvas.width = output.width
  scaledMaskCanvas.height = output.height
  const scaledMaskContext = scaledMaskCanvas.getContext('2d', { willReadFrequently: true })
  if (!scaledMaskContext) throw new Error('Canvas is unavailable for skin detection.')
  scaledMaskContext.imageSmoothingEnabled = true
  scaledMaskContext.imageSmoothingQuality = 'high'
  scaledMaskContext.drawImage(maskCanvas, 0, 0, output.width, output.height)
  const scaledMask = scaledMaskContext.getImageData(0, 0, output.width, output.height).data

  const warmth = skinTone.warmth / 100
  const tint = skinTone.tint / 100
  const saturation = skinTone.saturation / 100
  const luminance = skinTone.luminance / 100

  for (let index = 0; index < imageData.data.length; index += 4) {
    const personAlpha = smoothstep(0.2, 0.78, scaledMask[index] / 255)
    const skinWeight = smoothstep(0.12, 0.65, scaledMask[index + 1] / 255)
    let red = imageData.data[index] / 255
    let green = imageData.data[index + 1] / 255
    let blue = imageData.data[index + 2] / 255

    if (skinWeight > 0) {
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      let nextRed = red + warmth * 0.08 + tint * 0.035
      let nextGreen = green - tint * 0.07
      let nextBlue = blue - warmth * 0.08 + tint * 0.035
      const saturationScale = 1 + saturation * 0.65
      nextRed = luma + (nextRed - luma) * saturationScale + luminance * 0.16
      nextGreen = luma + (nextGreen - luma) * saturationScale + luminance * 0.16
      nextBlue = luma + (nextBlue - luma) * saturationScale + luminance * 0.16
      red += (nextRed - red) * skinWeight
      green += (nextGreen - green) * skinWeight
      blue += (nextBlue - blue) * skinWeight
    }

    const editedRed = clamp01(red) * 255
    const editedGreen = clamp01(green) * 255
    const editedBlue = clamp01(blue) * 255
    imageData.data[index] = Math.round(
      backgroundData[index] + (editedRed - backgroundData[index]) * personAlpha,
    )
    imageData.data[index + 1] = Math.round(
      backgroundData[index + 1] +
        (editedGreen - backgroundData[index + 1]) * personAlpha,
    )
    imageData.data[index + 2] = Math.round(
      backgroundData[index + 2] +
        (editedBlue - backgroundData[index + 2]) * personAlpha,
    )
    imageData.data[index + 3] = 255
  }
  context.putImageData(imageData, 0, 0)

  confidenceMasks?.forEach((mask) => mask.close())
  categoryMask?.close()

  return new Promise((resolve, reject) => {
    output.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Person cutout failed.'))),
      'image/png',
    )
  })
}
