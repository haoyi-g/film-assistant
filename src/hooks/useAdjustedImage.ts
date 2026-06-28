import { useEffect, useRef, useState } from 'react'
import {
  renderImageAdjustments,
  type ImageAdjustments,
} from '../utils/renderImageAdjustments'

export function useAdjustedImage(
  sourceUrl: string,
  adjustments: ImageAdjustments,
) {
  const [adjustedUrl, setAdjustedUrl] = useState('')
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const currentObjectUrl = useRef('')

  useEffect(() => {
    let cancelled = false

    if (!sourceUrl) {
      if (currentObjectUrl.current) URL.revokeObjectURL(currentObjectUrl.current)
      currentObjectUrl.current = ''
      setAdjustedUrl('')
      setIsRendering(false)
      setRenderError(null)
      return
    }

    setIsRendering(true)
    setRenderError(null)

    // A short debounce prevents rendering every intermediate slider event.
    const timer = window.setTimeout(() => {
      renderImageAdjustments(sourceUrl, adjustments)
        .then((blob) => {
          const nextUrl = URL.createObjectURL(blob)

          if (cancelled) {
            URL.revokeObjectURL(nextUrl)
            return
          }

          if (currentObjectUrl.current) {
            URL.revokeObjectURL(currentObjectUrl.current)
          }

          currentObjectUrl.current = nextUrl
          setAdjustedUrl(nextUrl)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setRenderError(
            error instanceof Error ? error.message : 'Image rendering failed.',
          )
        })
        .finally(() => {
          if (!cancelled) setIsRendering(false)
        })
    }, 50)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  },[
  sourceUrl,
  adjustments.lutId,
  adjustments.lutPath,
  adjustments.styleStrength,
  adjustments.shadowDensity,
  adjustments.colorDensity,
  adjustments.grainStrength,
  adjustments.exposure,
  adjustments.contrast,
  adjustments.shadows,
  adjustments.highlights,
  adjustments.warmth,
  adjustments.saturation,
  adjustments.hsl,
])

  useEffect(
    () => () => {
      if (currentObjectUrl.current) URL.revokeObjectURL(currentObjectUrl.current)
    },
    [],
  )

  return { adjustedUrl, isRendering, renderError }
}
