type ExportImageOptions = {
  imageUrl: string
  fileName: string
  rotation?: number
  quality?: number
}

function loadExportImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be exported.'))
    image.src = imageUrl
  })
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Image export failed.'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function exportImageFile({
  imageUrl,
  fileName,
  rotation = 0,
  quality = 0.94,
}: ExportImageOptions) {
  const image = await loadExportImage(imageUrl)
  const normalizedRotation = ((rotation % 360) + 360) % 360
  const shouldSwapSize =
    normalizedRotation === 90 || normalizedRotation === 270

  const canvas = document.createElement('canvas')
  canvas.width = shouldSwapSize ? image.height : image.width
  canvas.height = shouldSwapSize ? image.width : image.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available in this browser.')

  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((normalizedRotation * Math.PI) / 180)
  context.drawImage(image, -image.width / 2, -image.height / 2)

  const blob = await canvasToJpegBlob(canvas, quality)
  downloadBlob(blob, fileName)
}
