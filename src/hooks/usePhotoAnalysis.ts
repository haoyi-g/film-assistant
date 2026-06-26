import { useEffect, useState } from 'react'
import {
  analyzeImage,
  type PhotoAnalysis,
} from '../utils/analyzeImage'

type AnalysisState = {
  analysis: PhotoAnalysis | null
  isAnalyzing: boolean
  analysisError: string | null
}

export function usePhotoAnalysis(previewUrl: string): AnalysisState {
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrentRequest = true

    if (!previewUrl) {
      setAnalysis(null)
      setIsAnalyzing(false)
      setAnalysisError(null)
      return () => {
        isCurrentRequest = false
      }
    }

    setIsAnalyzing(true)
    setAnalysisError(null)

    analyzeImage(previewUrl)
      .then((result) => {
        if (isCurrentRequest) setAnalysis(result)
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest) return
        const message = error instanceof Error ? error.message : 'Image analysis failed.'
        setAnalysis(null)
        setAnalysisError(message)
      })
      .finally(() => {
        if (isCurrentRequest) setIsAnalyzing(false)
      })

    return () => {
      isCurrentRequest = false
    }
  }, [previewUrl])

  return { analysis, isAnalyzing, analysisError }
}
