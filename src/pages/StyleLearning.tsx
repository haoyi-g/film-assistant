import { useEffect, useState, type ChangeEvent } from 'react'
import { useLanguage } from '../i18n'

type OutputMode = 'lut' | 'recipe'
type PreviewMode = 'original' | 'edited' | 'compare'

type LearningImage = {
  name: string
  url: string
}

type LearningSignal = {
  label: string
  value: string
  description: string
}

const learningSignals: LearningSignal[] = [
  {
    label: 'Tone Curve',
    value: 'Detecting',
    description: 'Learns how contrast, black point, and highlight roll-off changed.',
  },
  {
    label: 'Color Shift',
    value: 'Detecting',
    description: 'Measures hue movement between original and edited image.',
  },
  {
    label: 'Saturation Map',
    value: 'Detecting',
    description: 'Finds which colors became richer or more muted.',
  },
  {
    label: 'Shadow / Highlight',
    value: 'Detecting',
    description: 'Separates dark-region edits from bright-region edits.',
  },
  {
    label: 'Skin Protection',
    value: 'Enabled',
    description: 'Limits strong color shifts on warm orange skin-like regions.',
  },
]

export function StyleLearning() {
  const { t } = useLanguage()
  const [originalImage, setOriginalImage] = useState<LearningImage | null>(null)
  const [editedImage, setEditedImage] = useState<LearningImage | null>(null)
  const [objectUrls, setObjectUrls] = useState<string[]>([])
  const [outputMode, setOutputMode] = useState<OutputMode>('lut')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('compare')
  const [compareSplit, setCompareSplit] = useState(50)
  const [styleName, setStyleName] = useState('My Learned Film Look')

  const canLearn = Boolean(originalImage && editedImage)

  useEffect(() => {
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [objectUrls])

  const createImageFromFile = (
    event: ChangeEvent<HTMLInputElement>,
    setter: (image: LearningImage) => void,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    const nextUrl = URL.createObjectURL(file)
    setObjectUrls((urls) => [...urls, nextUrl])
    setter({
      name: file.name,
      url: nextUrl,
    })
  }

  const handleLearnStyle = () => {
    if (!canLearn) return

    window.alert(
      outputMode === 'lut'
        ? 'Next step: generate a .cube LUT from the original/edited pair.'
        : 'Next step: generate a reusable slider recipe from this edit.',
    )
  }

  const previewImageUrl =
    previewMode === 'original'
      ? originalImage?.url
      : previewMode === 'edited'
        ? editedImage?.url
        : editedImage?.url || originalImage?.url

  return (
    <section className="workspace learning-workspace">
      <aside className="column">
        <section className="panel">
          <div className="panel-head">
            <h2>{t('Training Pair')}</h2>
            <span>{canLearn ? t('Ready') : t('Need 2 images')}</span>
          </div>

          <div className="panel-body">
            <label className="upload-zone">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => createImageFromFile(event, setOriginalImage)}
              />
              <span>
                {t('Upload Original Photo')}
                <br />
                {t('Before color grading')}
              </span>
            </label>

            <div className="thumb-row">
              {originalImage ? (
                <img
                  className="thumb"
                  src={originalImage.url}
                  alt="Original training input"
                />
              ) : (
                <div className="thumb placeholder-thumb" />
              )}
              <div>
                <strong>{originalImage?.name ?? t('No original selected')}</strong>
                <br />
                <span>{t('Source image before editing')}</span>
              </div>
            </div>

            <label className="upload-zone learning-upload-second">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => createImageFromFile(event, setEditedImage)}
              />
              <span>
                {t('Upload Edited Photo')}
                <br />
                {t('After color grading')}
              </span>
            </label>

            <div className="thumb-row">
              {editedImage ? (
                <img
                  className="thumb"
                  src={editedImage.url}
                  alt="Edited training target"
                />
              ) : (
                <div className="thumb placeholder-thumb" />
              )}
              <div>
                <strong>{editedImage?.name ?? t('No edited photo selected')}</strong>
                <br />
                <span>{t('Target image after editing')}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('Learn As')}</h2>
            <span>{outputMode === 'lut' ? '.cube' : t('Recipe')}</span>
          </div>

          <div className="panel-body">
            <div className="style-list">
              <button
                className={`style-card ${outputMode === 'lut' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setOutputMode('lut')}
              >
                <div className="style-title">
                  {t('Generate LUT')}
                  <span>.cube</span>
                </div>
                <div className="chips">
                    <span className="chip">{t('Color map')}</span>
                    <span className="chip">{t('Reusable')}</span>
                    <span className="chip">{t('Exportable')}</span>
                </div>
              </button>

              <button
                className={`style-card ${outputMode === 'recipe' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setOutputMode('recipe')}
              >
                <div className="style-title">
                  {t('Save Slider Style')}
                  <span>{t('Params')}</span>
                </div>
                <div className="chips">
                  <span className="chip">{t('Exposure')}</span>
                  <span className="chip">{t('Contrast')}</span>
                  <span className="chip">{t('Warmth')}</span>
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('Style Name')}</h2>
            <span>{t('Required')}</span>
          </div>

          <div className="panel-body">
            <input
              className="text-field"
              value={styleName}
              onChange={(event) => setStyleName(event.target.value)}
            />
            <textarea
              defaultValue={t('Learn the difference between the original and edited photo, then turn that difference into a reusable look.')}
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
              {t('Original')}
            </button>
            <button
              className={previewMode === 'edited' ? 'is-active' : ''}
              type="button"
              onClick={() => setPreviewMode('edited')}
            >
              {t('Edited')}
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
            <button type="button">{t('Auto Align')}</button>
            <button
              className="primary"
              type="button"
              disabled={!canLearn || !styleName.trim()}
              onClick={handleLearnStyle}
            >
              {outputMode === 'lut' ? t('Generate LUT') : t('Save Style')}
            </button>
          </div>
        </div>

        <div className="image-stage">
          {originalImage && editedImage && previewMode === 'compare' ? (
            <div className="compare-frame">
              <img
                className="compare-image"
                src={editedImage.url}
                alt="Edited result"
              />
              <img
                className="compare-image compare-original"
                src={originalImage.url}
                alt="Original source"
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
                {t('Original')}
              </div>
              <div className="compare-label compare-label-result">
                {t('Edited')}
              </div>
              <input
                className="compare-slider"
                type="range"
                min={0}
                max={100}
                value={compareSplit}
                aria-label="Drag to compare original and edited photo"
                onChange={(event) => setCompareSplit(Number(event.target.value))}
              />
            </div>
          ) : previewImageUrl ? (
            <img
              className="main-preview"
              src={previewImageUrl}
              alt="Learning preview"
            />
          ) : (
            <div className="empty-state">
              {t('Upload an original photo and its edited version to learn the style.')}
            </div>
          )}
        </div>
      </section>

      <aside className="column right-column">
        <section className="panel">
          <div className="panel-head">
            <h2>{t('Learning Summary')}</h2>
            <span>{canLearn ? t('Pair ready') : t('Waiting')}</span>
          </div>

          <div className="panel-body metric-grid">
            <div className="metric">
              <span>{t('Output')}</span>
              <strong>{outputMode === 'lut' ? 'LUT' : t('Style')}</strong>
            </div>
            <div className="metric">
              <span>{t('Pair Status')}</span>
              <strong>{canLearn ? t('Ready') : t('Missing')}</strong>
            </div>
            <div className="metric">
              <span>{t('Alignment')}</span>
              <strong>{canLearn ? t('Manual') : '—'}</strong>
            </div>
            <div className="metric">
              <span>{t('Strength')}</span>
              <strong>{canLearn ? t('Adaptive') : '—'}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('Learned Difference')}</h2>
            <span>{t('Preview')}</span>
          </div>

          <div className="panel-body">
            <ul className="param-list learning-vector-list">
              {learningSignals.map((item) => (
                <li key={item.label}>
                  <span>{t(item.label)}</span>
                  <strong>{canLearn ? t(item.value) : '—'}</strong>
                  <small>
                    {canLearn ? t(item.description) : t('Upload both images first')}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('Generation Rules')}</h2>
            <span>{t('Safety')}</span>
          </div>

          <div className="panel-body">
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              <span>{t('Keep skin tones natural when learning color shifts.')}</span>
            </label>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              <span>{t('Protect highlight detail from aggressive LUT curves.')}</span>
            </label>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              <span>{t('Limit shadow clipping when creating the learned style.')}</span>
            </label>
          </div>
        </section>
      </aside>
    </section>
  )
}
