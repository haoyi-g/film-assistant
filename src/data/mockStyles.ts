export type StyleAdjustments = {
  exposure: number
  contrast: number
  shadows: number
  highlights: number
  warmth: number
  saturation: number
}

export type StyleProfile = {
  id: string
  name: string
  match: number
  tags: string[]
  lutPath: string
  adjustments: StyleAdjustments
}

export const styles: StyleProfile[] = [
  {
    id: 'warm-golden-hour',
    name: 'Warm Golden Hour',
    match: 94,
    tags: ['Warm', 'Golden', 'Cinematic'],
    lutPath: '/luts/warm-golden-hour.cube',
    adjustments: {
      exposure: 8,
      contrast: 14,
      shadows: 12,
      highlights: -18,
      warmth: 28,
      saturation: 10,
    },
  },
  {
    id: 'faded-kodak',
    name: 'Faded Kodak',
    match: 88,
    tags: ['Film', 'Faded', 'Kodak'],
    lutPath: '/luts/faded-kodak.cube',
    adjustments: {
      exposure: 5,
      contrast: -8,
      shadows: 18,
      highlights: -22,
      warmth: 12,
      saturation: -6,
    },
  },
  {
    id: 'cool-blue-steel',
    name: 'Cool Blue Steel',
    match: 81,
    tags: ['Cold', 'Moody', 'Blue'],
    lutPath: '/luts/cool-blue-steel.cube',
    adjustments: {
      exposure: -6,
      contrast: 32,
      shadows: -18,
      highlights: -28,
      warmth: -18,
      saturation: -20,
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    match: 79,
    tags: ['Bold', 'Punchy', 'Cinematic'],
    lutPath: '/luts/high-contrast.cube',
    adjustments: {
      exposure: 0,
      contrast: 36,
      shadows: -10,
      highlights: -12,
      warmth: 0,
      saturation: 8,
    },
  },
  {
    id: 'matte-fade',
    name: 'Matte Fade',
    match: 76,
    tags: ['Matte', 'Soft black', 'Film'],
    lutPath: '/luts/matte-fade.cube',
    adjustments: {
      exposure: 4,
      contrast: -16,
      shadows: 22,
      highlights: -10,
      warmth: 6,
      saturation: -10,
    },
  },
]
