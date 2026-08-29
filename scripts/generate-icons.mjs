/**
 * Generates the app icons into `public/`.
 *
 * Checked-in output, regenerated with `pnpm icons`. Hand-rolled rather than
 * pulled from a raster toolchain: the mark is three descending bars — the
 * Ratchet stepping the Target down — which is a few rectangles, and a build
 * dependency for that would be a poor trade.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKGROUND = [0x0b, 0x0b, 0x0d]
const MARK = [0xe8, 0xe6, 0xe1]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

/** `pixel(x, y)` returns an [r, g, b] triple. */
function encodePng(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let offset = 0
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y)
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Three bars of descending height on a common baseline, drawn inside a square
 * of side `extent` whose top-left corner is (`inset`, `inset`).
 */
function markPainter(size, safeFraction) {
  const extent = size * safeFraction
  const inset = (size - extent) / 2
  const baseline = inset + extent
  const barWidth = extent * 0.22
  const gap = (extent - barWidth * 3) / 2
  const heights = [1, 0.66, 0.32].map((factor) => extent * factor)

  return (x, y) => {
    for (let i = 0; i < 3; i++) {
      const left = inset + i * (barWidth + gap)
      const top = baseline - heights[i]
      if (x >= left && x < left + barWidth && y >= top && y < baseline) return MARK
    }
    return BACKGROUND
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')
mkdirSync(publicDir, { recursive: true })

// `any` icons fill the square; the maskable one keeps the mark inside the
// inner 80% so a platform mask cannot clip it.
const icons = [
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['icon-512-maskable.png', 512, 0.44],
  ['apple-touch-icon.png', 180, 0.62],
]

for (const [name, size, safeFraction] of icons) {
  writeFileSync(join(publicDir, name), encodePng(size, markPainter(size, safeFraction)))
  console.log(`wrote public/${name} (${size}×${size})`)
}
