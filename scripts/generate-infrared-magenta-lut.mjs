import { mkdir, writeFile } from 'node:fs/promises'

const size = 33
const lines = [
  '# Simulated infrared: green colors become red/magenta',
  'TITLE "Infrared Magenta"',
  `LUT_3D_SIZE ${size}`,
  'DOMAIN_MIN 0.0 0.0 0.0',
  'DOMAIN_MAX 1.0 1.0 1.0',
]

const clamp01 = (value) => Math.min(1, Math.max(0, value))

function rgbToHsv(red, green, blue) {
  const value = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const difference = value - minimum
  const saturation = value === 0 ? 0 : difference / value
  let hue = 0

  if (difference !== 0) {
    if (value === red) hue = ((green - blue) / difference) % 6
    else if (value === green) hue = (blue - red) / difference + 2
    else hue = (red - green) / difference + 4

    hue /= 6
    if (hue < 0) hue += 1
  }

  return { hue, saturation, value }
}

// This project reads .cube data with red changing fastest.
for (let blueIndex = 0; blueIndex < size; blueIndex += 1) {
  for (let greenIndex = 0; greenIndex < size; greenIndex += 1) {
    for (let redIndex = 0; redIndex < size; redIndex += 1) {
      const red = redIndex / (size - 1)
      const green = greenIndex / (size - 1)
      const blue = blueIndex / (size - 1)
      const { hue, saturation, value } = rgbToHsv(red, green, blue)
      const isGreen =
        hue > 0.14 && hue < 0.52 && saturation > 0.06 && value > 0.03

      const output = isGreen
        ? [
            clamp01(value * 1.2),
            clamp01(value * 0.15),
            clamp01(value * 0.45),
          ]
        : [red, green, blue]

      lines.push(output.map((channel) => channel.toFixed(6)).join(' '))
    }
  }
}

await mkdir(new URL('../public/luts/', import.meta.url), { recursive: true })
await writeFile(
  new URL('../public/luts/infrared-magenta.cube', import.meta.url),
  `${lines.join('\n')}\n`,
  'utf8',
)

console.log(`Generated Infrared Magenta ${size}x${size}x${size} LUT.`)
