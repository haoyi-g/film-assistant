import { useEffect, useState, type ChangeEvent } from 'react'
import { styles, type StyleProfile } from './data/mockStyles'
import { checkDesktopEngine, openLocalPhoto, runningInDesktop } from './native/desktop'
import { StyleLearning } from './pages/StyleLearning'
import { Workspace } from './pages/Workspace'
import {
  createDefaultHslAdjustments,
  type HslColorKey,
} from './utils/renderImageAdjustments'

type AppView = 'workspace' | 'learning'

export function App() {
  const [activeView, setActiveView] = useState<AppView>('workspace')
  const [fileName, setFileName] = useState('No photo selected')
  const [previewUrl, setPreviewUrl] = useState('')
  const [browserObjectUrl, setBrowserObjectUrl] = useState('')
  const [desktopError, setDesktopError] = useState<string | null>(null)
  const [desktopMessage, setDesktopMessage] = useState<string | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<StyleProfile>(styles[0])
  const [selectedVersion, setSelectedVersion] = useState('B')
  const [styleStrength, setStyleStrength] = useState(0)
  const [shadowDensity, setShadowDensity] = useState(0)
  const [colorDensity, setColorDensity] = useState(0)
  const [grainStrength, setGrainStrength] = useState(0)

  const [exposure, setExposure] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [shadows, setShadows] = useState(0)
  const [highlights, setHighlights] = useState(0)
  const [warmth, setWarmth] = useState(0)
  const [saturation, setSaturation] = useState(0)
  const [hsl, setHsl] = useState(createDefaultHslAdjustments)

  const desktop = runningInDesktop()

  useEffect(() => {
    return () => {
      if (browserObjectUrl) URL.revokeObjectURL(browserObjectUrl)
    }
  }, [browserObjectUrl])

  const handleBrowserImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const nextUrl = URL.createObjectURL(file)
    setBrowserObjectUrl(nextUrl)
    setFileName(file.name)
    setPreviewUrl(nextUrl)
    setDesktopError(null)
  }

  const handleOpenDesktopImage = async () => {
    setDesktopError(null)
    setDesktopMessage(null)
    try {
      const photo = await openLocalPhoto()
      if (!photo) return
      setFileName(photo.fileName)
      setPreviewUrl(photo.previewUrl)
    } catch (error) {
      setDesktopError(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const handleDesktopHealthCheck = async () => {
    setDesktopError(null)
    setDesktopMessage(null)

    if (!desktop) {
      setDesktopMessage('This test only runs inside the Tauri desktop window.')
      return
    }

    try {
      const health = await checkDesktopEngine()
      setDesktopMessage(
        health.decoderPath
          ? `${health.message} Decoder: ${health.decoderPath}`
          : health.message,
      )
    } catch (error) {
      setDesktopError(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const handleStyleChange = (style: StyleProfile) => {
    setSelectedStyle(style)

    if (style.id === 'original') {
      setStyleStrength(0)
      setShadowDensity(0)
      setColorDensity(0)
      setGrainStrength(0)
      setExposure(0)
      setContrast(0)
      setShadows(0)
      setHighlights(0)
      setWarmth(0)
      setSaturation(0)
      setHsl(createDefaultHslAdjustments())
      return
    }

    const fullStrengthStyles = ['rgb-screen', 'infrared-magenta']
    setStyleStrength(fullStrengthStyles.includes(style.id) ? 100 : 62)
    setExposure(style.adjustments.exposure)
    setContrast(style.adjustments.contrast)
    setShadows(style.adjustments.shadows)
    setHighlights(style.adjustments.highlights)
    setWarmth(style.adjustments.warmth)
    setSaturation(style.adjustments.saturation)
  }

  const handleHslChange = (
    color: HslColorKey,
    channel: 'hue' | 'saturation' | 'luminance',
    value: number,
  ) => {
    setHsl((current) => ({
      ...current,
      [color]: { ...current[color], [channel]: value },
    }))
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">LOCAL COLOR WORKSPACE</span>
          <h1>Film Assistant</h1>
        </div>
        <div className="desktop-tools">
          <div className="app-view-tabs">
            <button
              className={activeView === 'workspace' ? 'is-active' : ''}
              type="button"
              onClick={() => setActiveView('workspace')}
            >
              Color Workspace
            </button>
            <button
              className={activeView === 'learning' ? 'is-active' : ''}
              type="button"
              onClick={() => setActiveView('learning')}
            >
              Style Learning
            </button>
          </div>
          <div className="desktop-state">
            <span className={`status-dot ${desktop ? 'is-online' : ''}`} />
            {desktop ? 'Desktop RAW engine' : 'Browser preview mode'}
          </div>
          <button type="button" className="engine-test" onClick={handleDesktopHealthCheck}>
            Test engine
          </button>
        </div>
      </header>

      {desktopError && <div className="error-banner">{desktopError}</div>}
      {desktopMessage && <div className="info-banner">{desktopMessage}</div>}

      {activeView === 'workspace' ? (
        <Workspace
          fileName={fileName}
          previewUrl={previewUrl}
          selectedStyle={selectedStyle}
          selectedVersion={selectedVersion}
          styleStrength={styleStrength}
          shadowDensity={shadowDensity}
          colorDensity={colorDensity}
          grainStrength={grainStrength}
          exposure={exposure}
          contrast={contrast}
          shadows={shadows}
          highlights={highlights}
          warmth={warmth}
          saturation={saturation}
          hsl={hsl}
          onImageChange={handleBrowserImage}
          onOpenDesktopImage={desktop ? handleOpenDesktopImage : undefined}
          onTestDesktopEngine={handleDesktopHealthCheck}
          onStyleChange={handleStyleChange}
          onVersionChange={setSelectedVersion}
          onStyleStrengthChange={setStyleStrength}
          onShadowDensityChange={setShadowDensity}
          onColorDensityChange={setColorDensity}
          onGrainStrengthChange={setGrainStrength}
          onExposureChange={setExposure}
          onContrastChange={setContrast}
          onShadowsChange={setShadows}
          onHighlightsChange={setHighlights}
          onWarmthChange={setWarmth}
          onSaturationChange={setSaturation}
          onHslChange={handleHslChange}
        />
      ) : (
        <StyleLearning />
      )}
    </main>
  )
}
