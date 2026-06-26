export type CubeLut = {
  size: number
  data: Float32Array
}

const lutCache = new Map<string, Promise<CubeLut>>()

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function parseCubeLut(text: string): CubeLut {
  let size = 0
  const values: number[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) continue
    if (line.startsWith('TITLE')) continue
    if (line.startsWith('DOMAIN_MIN')) continue
    if (line.startsWith('DOMAIN_MAX')) continue

    if (line.startsWith('LUT_3D_SIZE')) {
      const [, sizeText] = line.split(/\s+/)
      size = Number(sizeText)
      continue
    }

    const parts = line.split(/\s+/).map(Number)
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      values.push(clamp01(parts[0]), clamp01(parts[1]), clamp01(parts[2]))
    }
  }

  if (!size) {
    throw new Error('This .cube file does not contain LUT_3D_SIZE.')
  }

  const expectedValueCount = size * size * size * 3
  if (values.length < expectedValueCount) {
    throw new Error('This .cube file does not contain enough color data.')
  }

  return {
    size,
    data: new Float32Array(values.slice(0, expectedValueCount)),
  }
}

export async function loadCubeLut(lutPath: string): Promise<CubeLut> {
  const cached = lutCache.get(lutPath)
  if (cached) return cached

  const promise = fetch(lutPath)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Could not load LUT: ${lutPath}`)
      }
      return response.text()
    })
    .then(parseCubeLut)

  lutCache.set(lutPath, promise)
  return promise
}

function sampleCube(lut: CubeLut, redIndex: number, greenIndex: number, blueIndex: number) {
  // Most .cube files store values with red changing fastest, then green, then blue.
  // That means the linear order is: B block -> G row -> R column.
  const index = ((blueIndex * lut.size + greenIndex) * lut.size + redIndex) * 3

  return {
    red: lut.data[index],
    green: lut.data[index + 1],
    blue: lut.data[index + 2],
  }
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount
}

export function applyCubeLut(lut: CubeLut, red: number, green: number, blue: number) {
  const maxIndex = lut.size - 1

  const redPosition = clamp01(red) * maxIndex
  const greenPosition = clamp01(green) * maxIndex
  const bluePosition = clamp01(blue) * maxIndex

  const r0 = Math.floor(redPosition)
  const g0 = Math.floor(greenPosition)
  const b0 = Math.floor(bluePosition)

  const r1 = Math.min(maxIndex, r0 + 1)
  const g1 = Math.min(maxIndex, g0 + 1)
  const b1 = Math.min(maxIndex, b0 + 1)

  const rt = redPosition - r0
  const gt = greenPosition - g0
  const bt = bluePosition - b0

  const c000 = sampleCube(lut, r0, g0, b0)
  const c100 = sampleCube(lut, r1, g0, b0)
  const c010 = sampleCube(lut, r0, g1, b0)
  const c110 = sampleCube(lut, r1, g1, b0)
  const c001 = sampleCube(lut, r0, g0, b1)
  const c101 = sampleCube(lut, r1, g0, b1)
  const c011 = sampleCube(lut, r0, g1, b1)
  const c111 = sampleCube(lut, r1, g1, b1)

  const red00 = lerp(c000.red, c100.red, rt)
  const red10 = lerp(c010.red, c110.red, rt)
  const red01 = lerp(c001.red, c101.red, rt)
  const red11 = lerp(c011.red, c111.red, rt)

  const green00 = lerp(c000.green, c100.green, rt)
  const green10 = lerp(c010.green, c110.green, rt)
  const green01 = lerp(c001.green, c101.green, rt)
  const green11 = lerp(c011.green, c111.green, rt)

  const blue00 = lerp(c000.blue, c100.blue, rt)
  const blue10 = lerp(c010.blue, c110.blue, rt)
  const blue01 = lerp(c001.blue, c101.blue, rt)
  const blue11 = lerp(c011.blue, c111.blue, rt)

  const red0 = lerp(red00, red10, gt)
  const red1 = lerp(red01, red11, gt)
  const green0 = lerp(green00, green10, gt)
  const green1 = lerp(green01, green11, gt)
  const blue0 = lerp(blue00, blue10, gt)
  const blue1 = lerp(blue01, blue11, gt)

  return {
    red: clamp01(lerp(red0, red1, bt)),
    green: clamp01(lerp(green0, green1, bt)),
    blue: clamp01(lerp(blue0, blue1, bt)),
  }
}
