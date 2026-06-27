import { mkdir, writeFile } from 'node:fs/promises'

const size = 33
const lines = [
  '# Generated from the RGB Screen experiment',
  '# PIL grayscale luminance, then R=1.15L G=0.75L B=0.45L',
  'TITLE "RGB Screen"',
  `LUT_3D_SIZE ${size}`,
  'DOMAIN_MIN 0.0 0.0 0.0',
  'DOMAIN_MAX 1.0 1.0 1.0',
]

const clamp01 = (value) => Math.min(1, Math.max(0, value))

// .cube order used by this project: red changes fastest, then green, then blue.
for (let blueIndex = 0; blueIndex < size; blueIndex += 1) {
  for (let greenIndex = 0; greenIndex < size; greenIndex += 1) {
    for (let redIndex = 0; redIndex < size; redIndex += 1) {
      const red = redIndex / (size - 1)
      const green = greenIndex / (size - 1)
      const blue = blueIndex / (size - 1)
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue

      lines.push(
        [
          clamp01(luminance * 1.15),
          clamp01(luminance * 0.75),
          clamp01(luminance * 0.45),
        ]
          .map((value) => value.toFixed(6))
          .join(' '),
      )
    }
  }
}

await mkdir(new URL('../public/luts/', import.meta.url), { recursive: true })
await writeFile(
  new URL('../public/luts/rgb-screen.cube', import.meta.url),
  `${lines.join('\n')}\n`,
  'utf8',
)

console.log(`Generated RGB Screen ${size}x${size}x${size} LUT.`)
