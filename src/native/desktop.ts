import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export type LocalPhoto = {
  fileName: string
  sourcePath: string
  previewUrl: string
  sourceKind: 'raw' | 'jpeg'
  width?: number
  height?: number
}

type RawPreview = {
  previewPath: string
  width: number
  height: number
}

export type DesktopHealth = {
  message: string
  rawDecoderFound: boolean
  decoderPath?: string
}

const RAW_PATTERN = /\.(nef|nrw|dng|cr2|cr3|arw|raf)$/i

export const runningInDesktop = () => isTauri()

export async function checkDesktopEngine(): Promise<DesktopHealth> {
  return invoke<DesktopHealth>('desktop_health_check')
}

export async function openLocalPhoto(): Promise<LocalPhoto | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Photos',
        extensions: [
          'jpg', 'jpeg', 'png', 'webp',
          'nef', 'nrw', 'dng', 'cr2', 'cr3', 'arw', 'raf',
        ],
      },
    ],
  })

  if (!selected) return null
  const sourcePath = selected
  const fileName = sourcePath.split(/[\\/]/).pop() || sourcePath

  if (!RAW_PATTERN.test(sourcePath)) {
    return {
      fileName,
      sourcePath,
      previewUrl: convertFileSrc(sourcePath),
      sourceKind: 'jpeg',
    }
  }

  const preview = await invoke<RawPreview>('decode_raw_preview', { sourcePath })
  return {
    fileName,
    sourcePath,
    previewUrl: convertFileSrc(preview.previewPath),
    sourceKind: 'raw',
    width: preview.width,
    height: preview.height,
  }
}
