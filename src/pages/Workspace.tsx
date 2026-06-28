import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import * as exifr from 'exifr'
import { ControlRow } from '../components/ControlRow'
import { styles, type StyleProfile } from '../data/mockStyles'
import { useAdjustedImage } from '../hooks/useAdjustedImage'
import { usePhotoAnalysis } from '../hooks/usePhotoAnalysis'
import { exportImageFile } from '../utils/exportImageFile'
import { renderImageAdjustments } from '../utils/renderImageAdjustments'
import type {
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

}

type PreviewMode = 'original' | 'result' | 'compare'


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
  const [rawPreviewUrl, setRawPreviewUrl] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [isRawSelected, setIsRawSelected] = useState(false)
  const [isReadingRaw, setIsReadingRaw] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('result')
  const [compareSplit, setCompareSplit] = useState(50)
  const [isExporting, setIsExporting] = useState(false)
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([])
  const rawPreviewUrlRef = useRef('')

  const effectivePreviewUrl = isRawSelected
    ? isReadingRaw
      ? ''
      : rawPreviewUrl
    : props.previewUrl
  const effectiveFileName = selectedFileName || props.fileName

  useEffect(() => {
    return () => {
      if (rawPreviewUrlRef.current) URL.revokeObjectURL(rawPreviewUrlRef.current)
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
  }

  const { adjustedUrl, isRendering, renderError } = useAdjustedImage(
    effectivePreviewUrl,
    currentAdjustments,
  )

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
    const exportFileName = `${baseName}-film-preview.jpg`

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

  const previewImageUrl =
  previewMode === 'original'
    ? effectivePreviewUrl
    : adjustedUrl || effectivePreviewUrl

  const resultPreviewUrl = adjustedUrl || effectivePreviewUrl

  return (
    <>
      <section className="workspace">
        <aside className="column">
          <section className="panel">
            <div className="panel-head">
              <h2>Input Photo</h2>
              <span>
                {isReadingRaw
                  ? 'Reading RAW...'
                  : effectivePreviewUrl
                    ? 'Loaded'
                    : rawError
                      ? 'Failed'
                      : 'Waiting'}
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
                  Drop or click to upload a photo
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
                  Open RAW or photo from computer
                </button>
              )}

              {props.onTestDesktopEngine && (
                <button
                  className="desktop-open secondary"
                  type="button"
                  onClick={props.onTestDesktopEngine}
                >
                  Test desktop engine
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
                      ? 'Extracting embedded RAW preview...'
                      : rawError
                        ? rawError
                        : isAnalyzing
                          ? 'Analyzing photo...'
                          : effectivePreviewUrl
                            ? 'Ready for analysis'
                            : 'Choose a photo'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>LUT Source</h2>
              <span>{props.selectedStyle.match}% match</span>
            </div>

            <div className="panel-body">
              <div className="tabs">
                <button className="is-active" type="button">
                  Official LUTs
                </button>
                <button type="button">Mine</button>
                <button type="button">Reference LUT</button>
              </div>

              <button
                className={`style-card restore-original ${
                  props.selectedStyle.id === 'original' ? 'is-active' : ''
                }`}
                type="button"
                onClick={() => props.onStyleChange(styles[0])}
              >
                <div className="style-title">
                  Restore Original
                  <span>No LUT</span>
                </div>
                <div className="chips">
                  <span className="chip">Reset all adjustments</span>
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
              <h2>Language Intent</h2>
              <span>Optional</span>
            </div>
            <div className="panel-body">
              <textarea
                defaultValue="Make it feel like warm sunlight film, but avoid making the image too yellow."
                spellCheck={false}
              />
            </div>
          </section>
        </aside>

        <section className="panel preview-shell">
          <div className="preview-toolbar">
            <div className="segmented">
              <button
                className={previewMode === 'original' ? 'is-active' : ''}
                type="button"
                onClick={() => setPreviewMode('original')}
              >
                Original
              </button>

              <button
                className={previewMode === 'result' ? 'is-active' : ''}
                type="button"
                onClick={() => setPreviewMode('result')}
              >
                Result
              </button>

              <button
                className={previewMode === 'compare' ? 'is-active' : ''}
                type="button"
                onClick={() => setPreviewMode('compare')}
              >
                Compare
              </button>
            </div>

            <div className="segmented">
              <button type="button">Clipping</button>
              <button type="button">Shadows</button>
              <button
                type="button"
                disabled={!effectivePreviewUrl}
                onClick={rotateLeft}
              >
                Rotate left
              </button>
              <button
                type="button"
                disabled={!effectivePreviewUrl}
                onClick={rotateRight}
              >
                Rotate right
              </button>
              <button
                className="primary"
                type="button"
                disabled={!effectivePreviewUrl || isRendering || isExporting}
                onClick={handleExportPreview}
              >
                {isExporting ? 'Saving...' : 'Export Preview'}
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
                  src={resultPreviewUrl}
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
              <img
                className="main-preview"
                src={previewImageUrl}
                alt="Current edit preview"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            ) : (
              <div className="empty-state">
                Upload a photo to preview the color workspace flow.
              </div>
            )}
          </div>
        </section>

        <aside className="column right-column">
          <section className="panel">
            <div className="panel-head">
              <h2>Current Analysis</h2>
              <span title={analysisError ?? undefined}>{analysisStatus}</span>
            </div>

            <div className="panel-body metric-grid">
              <div className="metric">
                <span>Exposure</span>
                <strong>{analysis?.exposure ?? '—'}</strong>
              </div>
              <div className="metric">
                <span>Contrast</span>
                <strong>{analysis?.contrast ?? '—'}</strong>
              </div>
              <div className="metric">
                <span>Saturation</span>
                <strong>{analysis?.saturation ?? '—'}</strong>
              </div>
              <div className="metric">
                <span>Shadows</span>
                <strong>{analysis?.shadows ?? '—'}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Execution Control</h2>
              <span title={renderError ?? undefined}>{renderingStatus}</span>
            </div>

            <div className="panel-body">
             <ControlRow
                label="Exposure"
                value={props.exposure}
                min={-100}
                max={100}
                onChange={props.onExposureChange}
              />

              <ControlRow
                label="Contrast"
                value={props.contrast}
                min={-100}
                max={100}
                onChange={props.onContrastChange}
              />

              <ControlRow
                label="Shadows"
                value={props.shadows}
                min={-100}
                max={100}
                onChange={props.onShadowsChange}
              />

              <ControlRow
                label="Highlights"
                value={props.highlights}
                min={-100}
                max={100}
                onChange={props.onHighlightsChange}
              />

              <ControlRow
                label="Warmth"
                value={props.warmth}
                min={-100}
                max={100}
                onChange={props.onWarmthChange}
              />

              <ControlRow
                label="Saturation"
                value={props.saturation}
                min={-100}
                max={100}
                onChange={props.onSaturationChange}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>HSL Color Mixer</h2>
              <span>Selective colour</span>
            </div>
            <div className="panel-body hsl-mixer">
              {!effectivePreviewUrl ? (
                <div className="empty-state compact-empty">
                  Upload a photo to detect editable colours.
                </div>
              ) : isAnalyzing ? (
                <div className="empty-state compact-empty">
                  Analysing colours…
                </div>
              ) : analysis?.editableColors.length ? (
                analysis.editableColors.map(({ color, coverage }) => (
                <details className="hsl-color-group" key={color}>
                  <summary>
                    <span className={`hsl-swatch is-${color}`} />
                    <strong>{color[0].toUpperCase() + color.slice(1)}</strong>
                    <small>{Math.round(coverage * 100)}%</small>
                  </summary>
                  <ControlRow
                    label={`${color} Hue`}
                    value={props.hsl[color].hue}
                    min={-100}
                    max={100}
                    onChange={(value) => props.onHslChange(color, 'hue', value)}
                  />
                  <ControlRow
                    label={`${color} Saturation`}
                    value={props.hsl[color].saturation}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      props.onHslChange(color, 'saturation', value)
                    }
                  />
                  <ControlRow
                    label={`${color} Luminance`}
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
                  This photo is nearly monochrome. No strong colour range was detected.
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Export History</h2>
              <span>{exportHistory.length ? `${exportHistory.length} saved` : 'Empty'}</span>
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
                  ? 'Natural result'
                  : version === 'B'
                    ? 'Default style strength'
                    : 'Stronger film style'}
              </span>
            </button>
          ))}
        </section>

        <div className="footer-actions">
          <button type="button">Apply to Engine</button>
          <button className="primary" type="button">
            Save as My LUT
          </button>
        </div>
      </footer>
    </>
  )
}
