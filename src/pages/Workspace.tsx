import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import * as exifr from 'exifr'
import { ControlRow } from '../components/ControlRow'
import { useLanguage } from '../i18n'
import { styles, type StyleProfile } from '../data/mockStyles'
import { useAdjustedImage } from '../hooks/useAdjustedImage'
import { usePhotoAnalysis } from '../hooks/usePhotoAnalysis'
import { exportImageFile } from '../utils/exportImageFile'
import {
  createPersonCutout,
  type SkinToneAdjustments,
} from '../utils/personCutout'
import { renderImageAdjustments } from '../utils/renderImageAdjustments'
import type {
  ColorGradingAdjustments,
  HslAdjustments,
  HslColorKey,
} from '../utils/renderImageAdjustments'

type WorkspaceProps = {
  fileName: string
  previewUrl: string
  selectedStyle: StyleProfile
  selectedVersion: string

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
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void
  onOpenDesktopImage?: () => void
  onTestDesktopEngine?: () => void
  onStyleChange: (style: StyleProfile) => void
  onVersionChange: (version: string) => void
  onStyleStrengthChange: (value: number) => void
  onShadowDensityChange: (value: number) => void
  onColorDensityChange: (value: number) => void
  onGrainStrengthChange: (value: number) => void
  onExposureChange:(value:number) => void
  onContrastChange:(value:number) => void
  onShadowsChange:(value:number) => void
  onHighlightsChange:(value:number) => void
  onWarmthChange:(value:number) => void
  onSaturationChange:(value:number) => void
  onHslChange: (
    color: HslColorKey,
    channel: 'hue' | 'saturation' | 'luminance',
    value: number,
  ) => void
  onColorGradingChange: (
    zone: 'shadows' | 'midtones' | 'highlights',
    channel: 'hue' | 'saturation' | 'luminance',
    value: number,
  ) => void
  onColorGradingGlobalChange: (
    channel: 'balance' | 'blending',
    value: number,
  ) => void

}

type PreviewMode = 'original' | 'result' | 'compare'
type LocalAdjustments = {
  exposure: number
  contrast: number
  shadows: number
  highlights: number
  warmth: number
  saturation: number
}

type LocalMaskLayer = {
  id: string
  name: string
  maskUrl: string
  visible: boolean
  adjustments: LocalAdjustments
}

const createDefaultLocalAdjustments = (): LocalAdjustments => ({
  exposure: 0,
  contrast: 0,
  shadows: 0,
  highlights: 0,
  warmth: 0,
  saturation: 0,
})

const createMaskLayer = (index: number): LocalMaskLayer => ({
  id: crypto.randomUUID(),
  name: `Mask ${index}`,
  maskUrl: '',
  visible: true,
  adjustments: createDefaultLocalAdjustments(),
})


type JpegRange = {
  start: number
  end: number
}

type ExportHistoryItem = {
  id: string
  createdAt: string
  fileName: string
  lutName: string
  rotation: number
  adjustments: {
    exposure: number
    contrast: number
    shadows: number
    highlights: number
    warmth: number
    saturation: number
    styleStrength: number
  }
}

const EXPORT_HISTORY_KEY = 'film-assistant-export-history'

async function extractLargestEmbeddedJpeg(file: File): Promise<Blob | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const candidates: JpegRange[] = []
  let start = -1

  for (let index = 0; index < bytes.length - 1; index += 1) {
    const first = bytes[index]
    const second = bytes[index + 1]

    if (start === -1 && first === 0xff && second === 0xd8) {
      start = index
      index += 1
      continue
    }

    if (start !== -1 && first === 0xff && second === 0xd9) {
      const end = index + 2
      // Ignore tiny icons and accidental marker pairs in compressed RAW data.
      if (end - start >= 32 * 1024) candidates.push({ start, end })
      start = -1
      index += 1
    }
  }

  candidates.sort((a, b) => b.end - b.start - (a.end - a.start))

  // Validate candidates as real JPEG images before returning one.
  for (const candidate of candidates.slice(0, 12)) {
    const blob = file.slice(candidate.start, candidate.end, 'image/jpeg')

    try {
      const bitmap = await createImageBitmap(blob)
      const isUsefulPreview = bitmap.width >= 320 && bitmap.height >= 240
      bitmap.close()
      if (isUsefulPreview) return blob
    } catch {
      // Keep checking: RAW sensor data can contain marker-like byte sequences.
    }
  }

  return null
}

export function Workspace(props: WorkspaceProps) {
  const { t } = useLanguage()
  const [rawPreviewUrl, setRawPreviewUrl] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [isRawSelected, setIsRawSelected] = useState(false)
  const [isReadingRaw, setIsReadingRaw] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('result')
  const [compareSplit, setCompareSplit] = useState(50)
  const [isExporting, setIsExporting] = useState(false)
  const [isDetectingPerson, setIsDetectingPerson] = useState(false)
  const [personCutoutUrl, setPersonCutoutUrl] = useState('')
  const [personCutoutEnabled, setPersonCutoutEnabled] = useState(false)
  const [personCutoutError, setPersonCutoutError] = useState<string | null>(null)
  const [skinTone, setSkinTone] = useState<SkinToneAdjustments>({
    warmth: 0,
    tint: 0,
    saturation: 0,
    luminance: 0,
  })
  const [maskTool, setMaskTool] = useState<'off' | 'brush' | 'erase'>('off')
  const [showLocalMask, setShowLocalMask] = useState(true)
  const [brushSize, setBrushSize] = useState(70)
  const [brushFeather, setBrushFeather] = useState(45)
  const [localMasks, setLocalMasks] = useState<LocalMaskLayer[]>(() => [
    createMaskLayer(1),
  ])
  const [activeMaskId, setActiveMaskId] = useState(() => localMasks[0].id)
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([])
  const rawPreviewUrlRef = useRef('')
  const personCutoutUrlRef = useRef('')
  const localMaskCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingMaskRef = useRef(false)
  const lastMaskPointRef = useRef<{ x: number; y: number } | null>(null)
  const activeMask =
    localMasks.find((layer) => layer.id === activeMaskId) ?? localMasks[0]

  const effectivePreviewUrl = isRawSelected
    ? isReadingRaw
      ? ''
      : rawPreviewUrl
    : props.previewUrl
  const effectiveFileName = selectedFileName || props.fileName

  useEffect(() => {
    return () => {
      if (rawPreviewUrlRef.current) URL.revokeObjectURL(rawPreviewUrlRef.current)
      if (personCutoutUrlRef.current) URL.revokeObjectURL(personCutoutUrlRef.current)
    }
  }, [])

  useEffect(() => {
    const savedHistory = window.localStorage.getItem(EXPORT_HISTORY_KEY)
    if (!savedHistory) return

    try {
      setExportHistory(JSON.parse(savedHistory) as ExportHistoryItem[])
    } catch {
      window.localStorage.removeItem(EXPORT_HISTORY_KEY)
    }
  }, [])

  const replaceRawPreviewUrl = (nextUrl: string) => {
    if (rawPreviewUrlRef.current) URL.revokeObjectURL(rawPreviewUrlRef.current)
    rawPreviewUrlRef.current = nextUrl
    setRawPreviewUrl(nextUrl)
  }

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSelectedFileName(file.name)
    setRawError(null)

    const isRaw = /\.(nef|nrw|dng|cr2|cr3|arw|raf)$/i.test(file.name)
    setIsRawSelected(isRaw)
    if (!isRaw) {
      setIsReadingRaw(false)
      replaceRawPreviewUrl('')
      props.onImageChange(event)
      return
    }

    setIsReadingRaw(true)
    replaceRawPreviewUrl('')
    props.onImageChange(event)

    try {
      const thumbnail = await exifr.thumbnail(file).catch(() => undefined)

      function uint8ArrayToBlob(data: Uint8Array, type = 'image/jpeg') {
        const copy = new Uint8Array(data.byteLength)
        copy.set(data)

        return new Blob([copy.buffer], { type })
}
      const blob = thumbnail
  ? uint8ArrayToBlob(thumbnail, 'image/jpeg')
  : await extractLargestEmbeddedJpeg(file)
      if (!blob) {
        throw new Error(
          'No usable JPEG preview was found inside this RAW file.',
        )
      }

      replaceRawPreviewUrl(URL.createObjectURL(blob))
    } catch (error) {
      setRawError(
        error instanceof Error ? error.message : 'Unable to read RAW preview.',
      )
    } finally {
      setIsReadingRaw(false)
    }
  }

  const { analysis, isAnalyzing, analysisError } = usePhotoAnalysis(
    effectivePreviewUrl,
  )

  const currentAdjustments = {
    lutPath: props.selectedStyle.lutPath,
    styleStrength: props.styleStrength,
    shadowDensity: props.shadowDensity,
    colorDensity: props.colorDensity,
    grainStrength: props.grainStrength,
    exposure: props.exposure,
    contrast: props.contrast,
    shadows: props.shadows,
    highlights: props.highlights,
    warmth: props.warmth,
    saturation: props.saturation,
    hsl: props.hsl,
    colorGrading: props.colorGrading,
    localMasks,
  }

  const { adjustedUrl, isRendering, renderError } = useAdjustedImage(
    effectivePreviewUrl,
    currentAdjustments,
  )

  useEffect(() => {
    if (personCutoutUrlRef.current) URL.revokeObjectURL(personCutoutUrlRef.current)
    personCutoutUrlRef.current = ''
    setPersonCutoutUrl('')
    setPersonCutoutError(null)
  }, [adjustedUrl])

  useEffect(() => {
    setPersonCutoutEnabled(false)
    setMaskTool('off')
    const firstLayer = createMaskLayer(1)
    setLocalMasks([firstLayer])
    setActiveMaskId(firstLayer.id)
    const canvas = localMaskCanvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }, [effectivePreviewUrl])

  const analysisStatus = isAnalyzing
    ? 'Analyzing...'
    : analysisError
      ? 'Failed'
      : analysis
        ? 'Ready'
        : 'Waiting'

  const renderingStatus = renderError
    ? 'Failed'
    : isRendering
      ? 'Rendering...'
      : effectivePreviewUrl
        ? 'Ready'
        : 'Waiting'

  const handleExportPreview = async () => {
    if (!effectivePreviewUrl) return

    const baseName = effectiveFileName.replace(/\.[^.]+$/, '') || 'photo'
    const exportFileName = personCutoutEnabled
      ? `${baseName}-person-edit.jpg`
      : `${baseName}-film-preview.jpg`

    setIsExporting(true)
    let highQualityObjectUrl = ''

    try {
      const highQualityBlob = await renderImageAdjustments(
        effectivePreviewUrl,
        currentAdjustments,
        {
          maxRenderSize: 6000,
          quality: 0.98,
        },
      )

      highQualityObjectUrl = URL.createObjectURL(highQualityBlob)

      if (personCutoutEnabled) {
        const cutoutBlob = await createPersonCutout(
          highQualityObjectUrl,
          skinTone,
          highQualityObjectUrl,
        )
        URL.revokeObjectURL(highQualityObjectUrl)
        highQualityObjectUrl = URL.createObjectURL(cutoutBlob)
      }

      await exportImageFile({
        imageUrl: highQualityObjectUrl,
        fileName: exportFileName,
        rotation,
        quality: 0.98,
      })

      const nextRecord: ExportHistoryItem = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        fileName: exportFileName,
        lutName: props.selectedStyle.name,
        rotation,
        adjustments: {
          exposure: props.exposure,
          contrast: props.contrast,
          shadows: props.shadows,
          highlights: props.highlights,
          warmth: props.warmth,
          saturation: props.saturation,
          styleStrength: props.styleStrength,
        },
      }

      setExportHistory((currentHistory) => {
        const nextHistory = [nextRecord, ...currentHistory].slice(0, 8)
        window.localStorage.setItem(
          EXPORT_HISTORY_KEY,
          JSON.stringify(nextHistory),
        )
        return nextHistory
      })
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : 'Image export failed.',
      )
    } finally {
      if (highQualityObjectUrl) URL.revokeObjectURL(highQualityObjectUrl)
      setIsExporting(false)
    }
  }

  const rotateLeft = () => {
    setRotation((currentRotation) => (currentRotation + 270) % 360)
  }

  const rotateRight = () => {
    setRotation((currentRotation) => (currentRotation + 90) % 360)
  }

  const resultPreviewUrl = adjustedUrl || effectivePreviewUrl

  const displayedResultUrl = personCutoutUrl || resultPreviewUrl

  const previewImageUrl =
    previewMode === 'original' ? effectivePreviewUrl : displayedResultUrl

  const handlePersonCutout = () => {
    if (personCutoutEnabled) {
      URL.revokeObjectURL(personCutoutUrl)
      personCutoutUrlRef.current = ''
      setPersonCutoutUrl('')
      setPersonCutoutEnabled(false)
      return
    }
    if (!resultPreviewUrl) return
    setPersonCutoutEnabled(true)
    setPreviewMode('result')
  }

  useEffect(() => {
    if (!personCutoutEnabled || !resultPreviewUrl) return
    let cancelled = false
    setIsDetectingPerson(true)
    setPersonCutoutError(null)

    const timer = window.setTimeout(() => {
      createPersonCutout(resultPreviewUrl, skinTone, resultPreviewUrl)
        .then((blob) => {
          if (cancelled) return
          const nextUrl = URL.createObjectURL(blob)
          if (personCutoutUrlRef.current) {
            URL.revokeObjectURL(personCutoutUrlRef.current)
          }
          personCutoutUrlRef.current = nextUrl
          setPersonCutoutUrl(nextUrl)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          const message =
            error instanceof Error ? error.message : 'Person detection failed.'
          setPersonCutoutError(message)
          setPersonCutoutEnabled(false)
          window.alert(message)
        })
        .finally(() => {
          if (!cancelled) setIsDetectingPerson(false)
        })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [personCutoutEnabled, resultPreviewUrl, skinTone])

  const initializeLocalMask = (image: HTMLImageElement) => {
    const canvas = localMaskCanvasRef.current
    if (!canvas || !image.naturalWidth || !image.naturalHeight) return
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      setLocalMasks((layers) =>
        layers.map((layer) => ({ ...layer, maskUrl: '' })),
      )
    }
  }

  const getMaskPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const bounds = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    }
  }

  const drawMaskSegment = (
    canvas: HTMLCanvasElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const context = canvas.getContext('2d')
    if (!context || maskTool === 'off') return
    const scaledSize = brushSize * (canvas.width / 1000)
    context.save()
    context.globalCompositeOperation =
      maskTool === 'erase' ? 'destination-out' : 'source-over'
    context.strokeStyle = '#ff3b30'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = Math.max(2, scaledSize * (1 - brushFeather / 200))
    context.shadowColor = maskTool === 'erase' ? 'transparent' : '#ff3b30'
    context.shadowBlur = scaledSize * (brushFeather / 100) * 0.45
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    context.stroke()
    context.restore()
  }

  const handleMaskPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (maskTool === 'off') return
    event.currentTarget.setPointerCapture(event.pointerId)
    isDrawingMaskRef.current = true
    const point = getMaskPoint(event)
    lastMaskPointRef.current = point
    drawMaskSegment(event.currentTarget, point, point)
  }

  const handleMaskPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMaskRef.current || !lastMaskPointRef.current) return
    const point = getMaskPoint(event)
    drawMaskSegment(event.currentTarget, lastMaskPointRef.current, point)
    lastMaskPointRef.current = point
  }

  const finishMaskStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMaskRef.current) return
    isDrawingMaskRef.current = false
    lastMaskPointRef.current = null
    const maskUrl = event.currentTarget.toDataURL('image/png')
    setLocalMasks((layers) =>
      layers.map((layer) =>
        layer.id === activeMaskId ? { ...layer, maskUrl } : layer,
      ),
    )
  }

  const clearLocalMask = () => {
    const canvas = localMaskCanvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setLocalMasks((layers) =>
      layers.map((layer) =>
        layer.id === activeMaskId ? { ...layer, maskUrl: '' } : layer,
      ),
    )
  }

  const updateLocalAdjustment = (key: keyof LocalAdjustments, value: number) => {
    setLocalMasks((layers) =>
      layers.map((layer) =>
        layer.id === activeMaskId
          ? { ...layer, adjustments: { ...layer.adjustments, [key]: value } }
          : layer,
      ),
    )
  }

  const addMaskLayer = () => {
    const layer = createMaskLayer(localMasks.length + 1)
    setLocalMasks((layers) => [...layers, layer])
    setActiveMaskId(layer.id)
  }

  const removeActiveMaskLayer = () => {
    if (localMasks.length === 1) {
      clearLocalMask()
      return
    }
    const index = localMasks.findIndex((layer) => layer.id === activeMaskId)
    const nextLayers = localMasks.filter((layer) => layer.id !== activeMaskId)
    setLocalMasks(nextLayers)
    setActiveMaskId(nextLayers[Math.max(0, index - 1)].id)
  }

  useEffect(() => {
    const canvas = localMaskCanvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    context?.clearRect(0, 0, canvas.width, canvas.height)
    if (!activeMask?.maskUrl || !context) return
    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    image.src = activeMask.maskUrl
  }, [activeMaskId, activeMask?.maskUrl])

  return (
    <>
      <section className="workspace">
        <aside className="column">
          <section className="panel">
            <div className="panel-head">
              <h2>{t('Input Photo')}</h2>
              <span>
                {isReadingRaw
                  ? t('Reading RAW...')
                  : effectivePreviewUrl
                    ? t('Loaded')
                    : rawError
                      ? t('Failed')
                      : t('Waiting')}
              </span>
            </div>

            <div className="panel-body">
              <label className="upload-zone">
                <input
                  type="file"
                  accept="image/*,.nef,.nrw,.dng,.cr2,.cr3,.arw,.raf"
                  onChange={handleImageChange}
                />
                <span>
                  {t('Drop or click to upload a photo')}
                  <br />
                  JPG / PNG / WebP / RAW
                </span>
              </label>

              {props.onOpenDesktopImage && (
                <button
                  className="desktop-open"
                  type="button"
                  onClick={props.onOpenDesktopImage}
                >
                  {t('Open RAW or photo from computer')}
                </button>
              )}

              {props.onTestDesktopEngine && (
                <button
                  className="desktop-open secondary"
                  type="button"
                  onClick={props.onTestDesktopEngine}
                >
                  {t('Test desktop engine')}
                </button>
              )}

              <div className="thumb-row">
                {effectivePreviewUrl ? (
                  <img
                    src={effectivePreviewUrl}
                    className="thumb"
                    alt="Input preview"
                  />
                ) : (
                  <div className="thumb placeholder-thumb" />
                )}

                <div>
                  <strong>{effectiveFileName}</strong>
                  <br />
                  <span>
                    {isReadingRaw
                      ? t('Extracting embedded RAW preview...')
                      : rawError
                        ? rawError
                        : isAnalyzing
                          ? t('Analyzing photo...')
                          : effectivePreviewUrl
                            ? t('Ready for analysis')
                            : t('Choose a photo')}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('LUT Source')}</h2>
              <span>{props.selectedStyle.match}% match</span>
            </div>

            <div className="panel-body">
              <div className="tabs">
                <button className="is-active" type="button">
                  {t('Official LUTs')}
                </button>
                <button type="button">{t('Mine')}</button>
                <button type="button">{t('Reference LUT')}</button>
              </div>

              <button
                className={`style-card restore-original ${
                  props.selectedStyle.id === 'original' ? 'is-active' : ''
                }`}
                type="button"
                onClick={() => props.onStyleChange(styles[0])}
              >
                <div className="style-title">
                  {t('Restore Original')}
                  <span>{t('No LUT')}</span>
                </div>
                <div className="chips">
                <span className="chip">{t('Reset all adjustments')}</span>
                </div>
              </button>

              <div className="style-list">
                {styles.filter((style) => style.id !== 'original').map((style) => (
                  <button
                    className={`style-card ${
                      style.id === props.selectedStyle.id ? 'is-active' : ''
                    }`}
                    key={style.id}
                    type="button"
                    onClick={() => props.onStyleChange(style)}
                  >
                    <div className="style-title">
                      {style.name}
                      <span>{style.match}%</span>
                    </div>
                    <div className="chips">
                      {style.tags.map((tag) => (
                        <span className="chip" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('Language Intent')}</h2>
              <span>{t('Optional')}</span>
            </div>
            <div className="panel-body">
              <textarea
                defaultValue="Make it feel like warm sunlight film, but avoid making the image too yellow."
                spellCheck={false}
              />
            </div>
          </section>
        </aside>

        <div className="column center-column">
        <section className="panel preview-shell">
          <div className="preview-toolbar">
            <div className="segmented">
              <button
                className={previewMode === 'original' ? 'is-active' : ''}
                type="button"
                onClick={() => setPreviewMode('original')}
              >
              {t('Original')}
              </button>

              <button
                className={previewMode === 'result' ? 'is-active' : ''}
                type="button"
                onClick={() => setPreviewMode('result')}
              >
              {t('Result')}
              </button>

              <button
                className={previewMode === 'compare' ? 'is-active' : ''}
                type="button"
                onClick={() => setPreviewMode('compare')}
              >
              {t('Compare')}
              </button>
            </div>

            <div className="segmented">
              <button
                className={maskTool === 'brush' ? 'is-active' : ''}
                type="button"
                disabled={!effectivePreviewUrl}
                onClick={() => {
                  setMaskTool(maskTool === 'brush' ? 'off' : 'brush')
                  setPreviewMode('result')
                }}
              >
                {t('Brush')}
              </button>
              <button
                className={maskTool === 'erase' ? 'is-active' : ''}
                type="button"
                disabled={!effectivePreviewUrl}
                onClick={() => {
                  setMaskTool(maskTool === 'erase' ? 'off' : 'erase')
                  setPreviewMode('result')
                }}
              >
                {t('Erase')}
              </button>
              <button
                type="button"
                disabled={!activeMask?.maskUrl}
                onClick={() => setShowLocalMask((current) => !current)}
              >
                {showLocalMask ? t('Hide Mask') : t('Show Mask')}
              </button>
              <button type="button" disabled={!activeMask?.maskUrl} onClick={clearLocalMask}>
                {t('Clear Mask')}
              </button>
              <button
                className={personCutoutEnabled ? 'is-active' : ''}
                type="button"
                disabled={!effectivePreviewUrl || isRendering || isDetectingPerson}
                title={personCutoutError ?? undefined}
                onClick={handlePersonCutout}
              >
                {isDetectingPerson
                  ? t('Detecting...')
                  : personCutoutEnabled
                    ? t('Disable Person Edit')
                    : t('Person Detection')}
              </button>
              <button
                type="button"
                disabled={!effectivePreviewUrl}
                onClick={rotateLeft}
              >
                {t('Rotate left')}
              </button>
              <button
                type="button"
                disabled={!effectivePreviewUrl}
                onClick={rotateRight}
              >
                {t('Rotate right')}
              </button>
              <button
                className="primary"
                type="button"
                disabled={!effectivePreviewUrl || isRendering || isExporting}
                onClick={handleExportPreview}
              >
                {isExporting ? t('Saving...') : t('Export Preview')}
              </button>
            </div>
          </div>

          <div className="image-stage">
            {effectivePreviewUrl && previewMode === 'compare' ? (
              <div
                className="compare-frame"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                <img
                  className="compare-image"
                  src={displayedResultUrl}
                  alt="Edited preview"
                />
                <img
                  className="compare-image compare-original"
                  src={effectivePreviewUrl}
                  alt="Original preview"
                  style={{
                    clipPath: `inset(0 ${100 - compareSplit}% 0 0)`,
                  }}
                />
                <div
                  className="compare-divider"
                  style={{ left: `${compareSplit}%` }}
                >
                  <span />
                </div>
                <div className="compare-label compare-label-original">
                  Original
                </div>
                <div className="compare-label compare-label-result">
                  Result
                </div>
                <input
                  className="compare-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={compareSplit}
                  aria-label="Drag to compare original and result"
                  onChange={(event) => setCompareSplit(Number(event.target.value))}
                />
              </div>
            ) : effectivePreviewUrl ? (
              <div
                className="masked-preview-wrap"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                <img
                  className="main-preview"
                  src={previewImageUrl}
                  alt="Current edit preview"
                  onLoad={(event) => initializeLocalMask(event.currentTarget)}
                />
                <canvas
                  ref={localMaskCanvasRef}
                  className={`local-mask-canvas ${
                    showLocalMask ? 'is-visible' : ''
                  } ${maskTool !== 'off' ? 'is-editing' : ''}`}
                  onPointerDown={handleMaskPointerDown}
                  onPointerMove={handleMaskPointerMove}
                  onPointerUp={finishMaskStroke}
                  onPointerCancel={finishMaskStroke}
                />
              </div>
            ) : (
              <div className="empty-state">
                Upload a photo to preview the color workspace flow.
              </div>
            )}
          </div>
        </section>

        <div className="color-tools-row">
        <section className="panel">
          <div className="panel-head">
            <h2>{t('HSL Color Mixer')}</h2>
            <span>{t('Selective colour')}</span>
          </div>
          <div className="panel-body hsl-mixer">
            {!effectivePreviewUrl ? (
              <div className="empty-state compact-empty">
                {t('Upload a photo to detect editable colours.')}
              </div>
            ) : isAnalyzing ? (
              <div className="empty-state compact-empty">{t('Analysing colours…')}</div>
            ) : analysis?.editableColors.length ? (
              analysis.editableColors.map(({ color, coverage }) => (
                <details className="hsl-color-group" key={color}>
                  <summary>
                    <span className={`hsl-swatch is-${color}`} />
                    <strong>{t(color[0].toUpperCase() + color.slice(1))}</strong>
                    <small>{Math.round(coverage * 100)}%</small>
                  </summary>
                  <ControlRow
                    label={`${t(color[0].toUpperCase() + color.slice(1))} ${t('Hue')}`}
                    value={props.hsl[color].hue}
                    min={-100}
                    max={100}
                    onChange={(value) => props.onHslChange(color, 'hue', value)}
                  />
                  <ControlRow
                    label={`${t(color[0].toUpperCase() + color.slice(1))} ${t('Saturation')}`}
                    value={props.hsl[color].saturation}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      props.onHslChange(color, 'saturation', value)
                    }
                  />
                  <ControlRow
                    label={`${t(color[0].toUpperCase() + color.slice(1))} ${t('Luminance')}`}
                    value={props.hsl[color].luminance}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      props.onHslChange(color, 'luminance', value)
                    }
                  />
                </details>
              ))
            ) : (
              <div className="empty-state compact-empty">
                {t('This photo is nearly monochrome. No strong colour range was detected.')}
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('Color Grading')}</h2>
            <span>{t('Light zones')}</span>
          </div>
          <div className="panel-body color-grading">
            {(['shadows', 'midtones', 'highlights'] as const).map((zone) => (
              <details className="grading-zone" key={zone}>
                <summary>
                  <span
                    className="grading-swatch"
                    style={{
                      backgroundColor: `hsl(${props.colorGrading[zone].hue} 75% 55%)`,
                    }}
                  />
                  <strong>{t(zone[0].toUpperCase() + zone.slice(1))}</strong>
                </summary>
                <ControlRow
                  label={`${t(zone[0].toUpperCase() + zone.slice(1))} ${t('Hue')}`}
                  value={props.colorGrading[zone].hue}
                  min={0}
                  max={360}
                  onChange={(value) =>
                    props.onColorGradingChange(zone, 'hue', value)
                  }
                />
                <ControlRow
                  label={`${t(zone[0].toUpperCase() + zone.slice(1))} ${t('Saturation')}`}
                  value={props.colorGrading[zone].saturation}
                  min={0}
                  max={100}
                  onChange={(value) =>
                    props.onColorGradingChange(zone, 'saturation', value)
                  }
                />
                <ControlRow
                  label={`${t(zone[0].toUpperCase() + zone.slice(1))} ${t('Luminance')}`}
                  value={props.colorGrading[zone].luminance}
                  min={-100}
                  max={100}
                  onChange={(value) =>
                    props.onColorGradingChange(zone, 'luminance', value)
                  }
                />
              </details>
            ))}

            <ControlRow
              label={t('Balance')}
              value={props.colorGrading.balance}
              min={-100}
              max={100}
              onChange={(value) =>
                props.onColorGradingGlobalChange('balance', value)
              }
            />
            <ControlRow
              label={t('Blending')}
              value={props.colorGrading.blending}
              min={0}
              max={100}
              onChange={(value) =>
                props.onColorGradingGlobalChange('blending', value)
              }
            />
          </div>
        </section>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('Local Mask Layers')}</h2>
            <span>{localMasks.length} layer{localMasks.length === 1 ? '' : 's'}</span>
          </div>
          <div className="panel-body local-adjustment-grid">
            <div>
              <div className="mask-layer-actions">
                <button type="button" onClick={addMaskLayer}>+ {t('New Mask')}</button>
                <button type="button" onClick={removeActiveMaskLayer}>
                  {localMasks.length === 1 ? t('Reset') : t('Delete')}
                </button>
              </div>
              <div className="mask-layer-list">
                {localMasks.map((layer) => (
                  <button
                    className={layer.id === activeMaskId ? 'is-active' : ''}
                    type="button"
                    key={layer.id}
                    onClick={() => setActiveMaskId(layer.id)}
                  >
                    <span>{layer.name}</span>
                    <small>{layer.maskUrl ? t('Painted') : t('Empty')}</small>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      aria-label={`Toggle ${layer.name}`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const visible = event.target.checked
                        setLocalMasks((layers) => layers.map((item) =>
                          item.id === layer.id ? { ...item, visible } : item,
                        ))
                      }}
                    />
                  </button>
                ))}
              </div>
              <ControlRow
                label={t('Brush Size')}
                value={brushSize}
                min={10}
                max={220}
                onChange={setBrushSize}
              />
              <ControlRow
                label={t('Brush Feather')}
                value={brushFeather}
                min={0}
                max={100}
                onChange={setBrushFeather}
              />
            </div>
            <div>
              {(Object.keys(activeMask.adjustments) as Array<keyof LocalAdjustments>).map(
                (key) => (
                  <ControlRow
                    key={key}
                    label={t(`Local ${key[0].toUpperCase() + key.slice(1)}`)}
                    value={activeMask.adjustments[key]}
                    min={-100}
                    max={100}
                    onChange={(value) => updateLocalAdjustment(key, value)}
                  />
                ),
              )}
            </div>
          </div>
        </section>
        </div>

        <aside className="column right-column">
          <section className="panel">
            <div className="panel-head">
              <h2>{t('Current Analysis')}</h2>
              <span title={analysisError ?? undefined}>{t(analysisStatus)}</span>
            </div>

            <div className="panel-body metric-grid">
              <div className="metric">
                <span>{t('Exposure')}</span>
                <strong>{analysis?.exposure ?? '—'}</strong>
              </div>
              <div className="metric">
                <span>{t('Contrast')}</span>
                <strong>{analysis?.contrast ?? '—'}</strong>
              </div>
              <div className="metric">
                <span>{t('Saturation')}</span>
                <strong>{analysis?.saturation ?? '—'}</strong>
              </div>
              <div className="metric">
                <span>{t('Shadows')}</span>
                <strong>{analysis?.shadows ?? '—'}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('Execution Control')}</h2>
              <span title={renderError ?? undefined}>{t(renderingStatus)}</span>
            </div>

            <div className="panel-body">
              <ControlRow
                label={t('LUT Strength')}
                value={props.styleStrength}
                min={0}
                max={100}
                onChange={props.onStyleStrengthChange}
              />

             <ControlRow
                label={t('Exposure')}
                value={props.exposure}
                min={-100}
                max={100}
                onChange={props.onExposureChange}
              />

              <ControlRow
                label={t('Contrast')}
                value={props.contrast}
                min={-100}
                max={100}
                onChange={props.onContrastChange}
              />

              <ControlRow
                label={t('Shadows')}
                value={props.shadows}
                min={-100}
                max={100}
                onChange={props.onShadowsChange}
              />

              <ControlRow
                label={t('Highlights')}
                value={props.highlights}
                min={-100}
                max={100}
                onChange={props.onHighlightsChange}
              />

              <ControlRow
                label={t('Warmth')}
                value={props.warmth}
                min={-100}
                max={100}
                onChange={props.onWarmthChange}
              />

              <ControlRow
                label={t('Saturation')}
                value={props.saturation}
                min={-100}
                max={100}
                onChange={props.onSaturationChange}
              />

              {personCutoutEnabled && (
                <div className="skin-tone-controls">
                  <div className="control-section-title">
                    <strong>{t('Skin Tone')}</strong>
                    <span>{t('Skin only')}</span>
                  </div>
                  <ControlRow
                    label={t('Skin Warmth')}
                    value={skinTone.warmth}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      setSkinTone((current) => ({ ...current, warmth: value }))
                    }
                  />
                  <ControlRow
                    label={t('Skin Tint')}
                    value={skinTone.tint}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      setSkinTone((current) => ({ ...current, tint: value }))
                    }
                  />
                  <ControlRow
                    label={t('Skin Saturation')}
                    value={skinTone.saturation}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      setSkinTone((current) => ({ ...current, saturation: value }))
                    }
                  />
                  <ControlRow
                    label={t('Skin Luminance')}
                    value={skinTone.luminance}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      setSkinTone((current) => ({ ...current, luminance: value }))
                    }
                  />
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('HSL Color Mixer')}</h2>
              <span>{t('Selective colour')}</span>
            </div>
            <div className="panel-body hsl-mixer">
              {!effectivePreviewUrl ? (
                <div className="empty-state compact-empty">
                  {t('Upload a photo to detect editable colours.')}
                </div>
              ) : isAnalyzing ? (
                <div className="empty-state compact-empty">
                  {t('Analysing colours…')}
                </div>
              ) : analysis?.editableColors.length ? (
                analysis.editableColors.map(({ color, coverage }) => (
                <details className="hsl-color-group" key={color}>
                  <summary>
                    <span className={`hsl-swatch is-${color}`} />
                    <strong>{t(color[0].toUpperCase() + color.slice(1))}</strong>
                    <small>{Math.round(coverage * 100)}%</small>
                  </summary>
                  <ControlRow
                    label={`${t(color[0].toUpperCase() + color.slice(1))} ${t('Hue')}`}
                    value={props.hsl[color].hue}
                    min={-100}
                    max={100}
                    onChange={(value) => props.onHslChange(color, 'hue', value)}
                  />
                  <ControlRow
                    label={`${t(color[0].toUpperCase() + color.slice(1))} ${t('Saturation')}`}
                    value={props.hsl[color].saturation}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      props.onHslChange(color, 'saturation', value)
                    }
                  />
                  <ControlRow
                    label={`${t(color[0].toUpperCase() + color.slice(1))} ${t('Luminance')}`}
                    value={props.hsl[color].luminance}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      props.onHslChange(color, 'luminance', value)
                    }
                  />
                </details>
                ))
              ) : (
                <div className="empty-state compact-empty">
                  {t('This photo is nearly monochrome. No strong colour range was detected.')}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('Color Grading')}</h2>
              <span>{t('Light zones')}</span>
            </div>
            <div className="panel-body color-grading">
              {(['shadows', 'midtones', 'highlights'] as const).map((zone) => (
                <details className="grading-zone" key={zone}>
                  <summary>
                    <span
                      className="grading-swatch"
                      style={{
                        backgroundColor: `hsl(${props.colorGrading[zone].hue} 75% 55%)`,
                      }}
                    />
                    <strong>{t(zone[0].toUpperCase() + zone.slice(1))}</strong>
                  </summary>
                  <ControlRow
                    label={`${t(zone[0].toUpperCase() + zone.slice(1))} ${t('Hue')}`}
                    value={props.colorGrading[zone].hue}
                    min={0}
                    max={360}
                    onChange={(value) =>
                      props.onColorGradingChange(zone, 'hue', value)
                    }
                  />
                  <ControlRow
                    label={`${t(zone[0].toUpperCase() + zone.slice(1))} ${t('Saturation')}`}
                    value={props.colorGrading[zone].saturation}
                    min={0}
                    max={100}
                    onChange={(value) =>
                      props.onColorGradingChange(zone, 'saturation', value)
                    }
                  />
                  <ControlRow
                    label={`${t(zone[0].toUpperCase() + zone.slice(1))} ${t('Luminance')}`}
                    value={props.colorGrading[zone].luminance}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      props.onColorGradingChange(zone, 'luminance', value)
                    }
                  />
                </details>
              ))}

              <ControlRow
                label={t('Balance')}
                value={props.colorGrading.balance}
                min={-100}
                max={100}
                onChange={(value) =>
                  props.onColorGradingGlobalChange('balance', value)
                }
              />
              <ControlRow
                label={t('Blending')}
                value={props.colorGrading.blending}
                min={0}
                max={100}
                onChange={(value) =>
                  props.onColorGradingGlobalChange('blending', value)
                }
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('Export History')}</h2>
              <span>{exportHistory.length ? `${exportHistory.length} ${t('saved')}` : t('Empty')}</span>
            </div>
            <div className="panel-body">
              {exportHistory.length ? (
                <ul className="export-history-list">
                  {exportHistory.map((item) => (
                    <li key={item.id}>
                      <div className="export-history-title">
                        <span>{item.fileName}</span>
                        <strong>{new Date(item.createdAt).toLocaleTimeString()}</strong>
                      </div>
                      <div className="export-history-meta">
                        {item.lutName} · E {item.adjustments.exposure} · C{' '}
                        {item.adjustments.contrast} · W {item.adjustments.warmth}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state compact-empty">
                  Export a preview to record its LUT and adjustment values.
                </div>
              )}
            </div>
          </section>
        </aside>
      </section>

      <footer className="footer">
        <section className="result-strip">
          {['A', 'B', 'C'].map((version) => (
            <button
              className={`version-card ${
                props.selectedVersion === version ? 'is-active' : ''
              }`}
              key={version}
              type="button"
              onClick={() => props.onVersionChange(version)}
            >
              <strong>Version {version}</strong>
              <span>
                {version === 'A'
                  ? t('Natural result')
                  : version === 'B'
                    ? t('Default style strength')
                    : t('Stronger film style')}
              </span>
            </button>
          ))}
        </section>

        <div className="footer-actions">
              <button type="button">{t('Apply to Engine')}</button>
          <button className="primary" type="button">
            Save as My LUT
          </button>
        </div>
      </footer>
    </>
  )
}
