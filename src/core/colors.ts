import { flatten } from './flatten'
import type { Catalog, Color } from './types'

/** Pigment material id -> its colour in the finished profile. Anything else (wax, graft, waste ...) is ignored. */
const PIGMENTS: Record<string, [number, number, number]> = {
  titan: [244, 243, 238],
  yellow: [224, 178, 28],
  red: [178, 38, 34],
  brown: [104, 70, 44],
  'carbon-black': [28, 28, 28],
}
/** Natural WPC (wood + polymer) that the pigments are mixed into; weighs as much as 1 kg of pigment. */
const BASE: [number, number, number] = [176, 156, 128]
const BASE_KG = 1

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)

/** Swatch colour of a colour formula: the user's own pick, or a weighted mix of its pigments. */
export function colorSwatch(color: Color, catalog: Pick<Catalog, 'recipes' | 'materials'>): string {
  if (isHex(color.hex)) return color.hex.toLowerCase()
  const flat = flatten(color.items, catalog)
  let w = BASE_KG
  const sum = [BASE[0] * BASE_KG, BASE[1] * BASE_KG, BASE[2] * BASE_KG]
  for (const [id, kg] of Object.entries(flat)) {
    const c = PIGMENTS[id]
    if (!c || kg <= 0) continue
    w += kg
    for (let i = 0; i < 3; i++) sum[i] += c[i] * kg
  }
  return `#${hex2(sum[0] / w)}${hex2(sum[1] / w)}${hex2(sum[2] / w)}`
}

/** Perceived brightness 0..255, used to pick readable text over a swatch. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}
