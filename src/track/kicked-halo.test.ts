import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MARK_GAP } from './timeline-fan.ts'

/**
 * The Kicked halo, read off the stylesheet that draws it (`screens.md` § The
 * Kicked halo).
 *
 * The halo is CSS and nothing else — no module computes it, because a computed
 * halo is one the fan could be handed. So the stylesheet is the artefact under
 * test, the way `timeline-fan.test.ts` already reads the timeline's floor off
 * it. Every claim here is one a plausible edit would break silently: a
 * `box-shadow` shorthand that deletes a rim, a band widened past the gutter, an
 * accent re-toned down to something the dim lane can no longer separate.
 */
const stylesheet = readFileSync('src/index.css', 'utf8')

/**
 * One rule's body, addressed by the selector text as the file writes it — whole,
 * so an at-rule's nested blocks come with it.
 *
 * The selector has to be **unique** in the stylesheet: addressing a rule by a
 * string that matches two of them would read one and silently ignore the other,
 * which is the failure this whole file exists to catch rather than commit.
 */
function ruleFor(selectorText: string): string {
  const opening = `${selectorText} {`
  const opened = stylesheet.indexOf(opening)
  if (opened === -1) throw new Error(`No \`${selectorText}\` rule in the stylesheet`)
  if (stylesheet.indexOf(opening, opened + 1) !== -1) {
    throw new Error(`\`${selectorText}\` opens more than one rule in the stylesheet`)
  }

  const from = opened + opening.length
  let depth = 1
  for (let at = from; at < stylesheet.length; at += 1) {
    if (stylesheet[at] === '{') depth += 1
    if (stylesheet[at] === '}') depth -= 1
    if (depth === 0) return stylesheet.slice(from, at)
  }
  throw new Error(`\`${selectorText}\` is never closed`)
}

/** The one hex colour a declaration names. */
function colourIn(declarations: string, property: string): string {
  const found = new RegExp(`${property}:[^;]*?(#[0-9a-f]{6})`).exec(declarations)
  if (found === null) throw new Error(`No colour on \`${property}\``)
  return found[1]!
}

/**
 * A custom property's colour, found by its own name rather than by the rule it
 * is declared in — the tokens live across two blocks and a `:root`, and which
 * block holds which is not a fact worth pinning here.
 */
function tokenColour(property: string): string {
  const declarations = [...stylesheet.matchAll(new RegExp(`${property}: (#[0-9a-f]{6});`, 'g'))]
  if (declarations.length !== 1) {
    throw new Error(`Expected one \`${property}\` declaration, found ${declarations.length}`)
  }
  return declarations[0]![1]!
}

const HALO = ruleFor('.puff-mark.kicked,\n.yesterday-mark.kicked')

const INK = tokenColour('--color-ink')
const PAPER = tokenColour('--color-paper')
const ACCENT = tokenColour('--kick-accent')
const RESISTED_TEAL = colourIn(ruleFor('.resisted-mark,\n.yesterday-ring'), 'border')
const OVER_TARGET_RED = colourIn(ruleFor('.puff-mark.over-target'), 'background')

/** The Yesterday lane's dimness, read where the lane sets it rather than written down twice. */
const YESTERDAY_OPACITY = Number(/opacity: ([\d.]+)/.exec(ruleFor('.yesterday-lane'))![1])

interface Rgb {
  r: number
  g: number
  b: number
}

function rgbOf(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

/**
 * What the lane's `opacity` actually leaves on the screen: the colour
 * composited over ink. The lane is dimmed as a whole, so this is the only form
 * in which yesterday's halo, ring and mark are ever seen.
 */
function dimmed(hex: string): Rgb {
  const colour = rgbOf(hex)
  const ink = rgbOf(INK)
  const over = (channel: 'r' | 'g' | 'b') =>
    colour[channel] * YESTERDAY_OPACITY + ink[channel] * (1 - YESTERDAY_OPACITY)
  return { r: over('r'), g: over('g'), b: over('b') }
}

/** Its hue in degrees — the one channel the dim lane is left with. */
function hueOf({ r, g, b }: Rgb): number {
  const high = Math.max(r, g, b)
  const spread = high - Math.min(r, g, b)
  if (spread === 0) return 0
  const sector =
    high === r ? ((g - b) / spread) % 6 : high === g ? (b - r) / spread + 2 : (r - g) / spread + 4
  return (sector * 60 + 360) % 360
}

/** How far apart two hues are on the wheel, the short way round. */
function hueGap(one: Rgb, other: Rgb): number {
  const apart = Math.abs(hueOf(one) - hueOf(other))
  return Math.min(apart, 360 - apart)
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(one: Rgb, other: Rgb): number {
  const [brighter, darker] = [relativeLuminance(one), relativeLuminance(other)].sort(
    (left, right) => right - left,
  )
  return (brighter! + 0.05) / (darker! + 0.05)
}

describe('the Kicked halo', () => {
  it("draws three nested bands, 4px per side, and nests the mark's own rim", () => {
    const bands = [...HALO.matchAll(/0 0 0 (\d+)px (var\(--[a-z-]+\))/g)].map((band) => ({
      to: Number(band[1]),
      colour: band[2],
    }))

    // 0–1px the mark's own rim, 1–2px ink for the detachment, 2–4px the accent.
    expect(bands).toEqual([
      { to: 1, colour: 'var(--mark-rim)' },
      { to: 2, colour: 'var(--color-ink)' },
      { to: 4, colour: 'var(--kick-accent)' },
    ])
  })

  it("keeps the mark's own rim by naming it, so an over-Target mark draws both", () => {
    // The whole of the nesting fix. `.over-target` swaps the rim's *colour* and
    // owns no `box-shadow` of its own, so the halo's innermost band is the red
    // one on an over-Target mark and the paper one everywhere else. Written as a
    // `box-shadow` shorthand, the halo would silently delete whichever rim the
    // mark was wearing — and neither ring has standing to censor the other.
    expect(HALO).toContain('var(--mark-rim)')
    expect(HALO).not.toMatch(/#[0-9a-f]{6}/)
    expect(ruleFor('.puff-mark.over-target')).not.toContain('box-shadow')
    expect(ruleFor('.puff-mark.over-target')).toContain('--mark-rim:')
    expect(ruleFor('.puff-mark,\n.yesterday-mark')).toContain(
      'box-shadow: 0 0 0 1px var(--mark-rim)',
    )
  })

  it('costs no tap area, and no layout at all', () => {
    // A `box-shadow` is not hit-tested, so a Kicked mark's handle is exactly the
    // handle it was. Anything else in this rule — a border, a padding, a size,
    // an inset — would grow the mark or move it.
    const properties = [...HALO.matchAll(/^ {2}([a-z-]+):/gm)].map((found) => found[1])

    expect(properties).toEqual(['box-shadow'])
  })

  it("takes exactly the fan's gutter, so two Kicked neighbours share one band", () => {
    // The band is *exactly* `MARK_GAP`: a halo abuts an unkicked neighbour
    // without covering it, and two adjacent Kicked marks occupy the same gutter
    // and read as a single merged ring. That is an accepted degradation rather
    // than a rendering bug — and widening the band is what would make it one,
    // because the fan is deliberately not taught the halo.
    const outermost = Math.max(
      ...[...HALO.matchAll(/0 0 0 (\d+)px/g)].map((band) => Number(band[1])),
    )

    expect(outermost).toBe(MARK_GAP)
  })

  it("breathes with the open mark, because the pulse scales rather than resizes", () => {
    // The 4px is a **static-layout** ceiling and not a cap on animation: a
    // `box-shadow` scales with its element, so on a 44px open mark the halo
    // transiently reaches ~2px past its static edge. That is the common case —
    // you are usually marking while the Merge Window is still open — and it
    // holds only while the pulse animates `scale`. Rewritten to animate `width`
    // and `height`, the mark would grow and the halo would stay put, and this
    // claim would fail with nothing to say so.
    const pulse = ruleFor('@keyframes session-pulse')
    expect(pulse).toContain('scale:')
    expect(pulse).not.toMatch(/\b(width|height|inset|padding):/)

    // Only one session is ever open, and `prefers-reduced-motion` already
    // stills it — halo and all, because the halo is drawn on the mark itself.
    expect(ruleFor('@media (prefers-reduced-motion: reduce)')).toContain('.puff-mark.open-mark')
  })

  it('is the same treatment in both lanes, with nothing added per-mark', () => {
    // ADR 0014: a lane is its marks, not its furniture. Yesterday's Kicks are
    // the live lane's halo at the lane's own dimness and nothing else, which one
    // shared selector — and no second rule anywhere — is what guarantees.
    expect(stylesheet).toContain('.puff-mark.kicked,\n.yesterday-mark.kicked {')
    expect([...stylesheet.matchAll(/\.kicked/g)]).toHaveLength(2)
  })

  it('spends lilac on the halo and nowhere else', () => {
    expect(ACCENT).toBe('#c9a8f0')
    expect([...stylesheet.matchAll(/#c9a8f0/g)]).toHaveLength(1)

    // A count rather than an absence, because the accent has exactly one
    // sanctioned second reader — the editor's `Kicked` toggle in its on-state,
    // which K3 builds. **This number is a tripwire, not a ceiling**: K3 raises
    // it to 2 and nothing raises it again. Anything else reaching for lilac is
    // the dilution amber was refused for, arriving by the other door.
    expect([...stylesheet.matchAll(/var\(--kick-accent\)/g)]).toHaveLength(1)
  })

  it('stays a modifier on a mark rather than an event class beside one', () => {
    // Between the red fill and the teal ring in contrast against ink: the halo
    // must never outshout a Resisted Urge or an over-Target mark on the lane it
    // shares with them.
    const ink = rgbOf(INK)

    expect(contrast(rgbOf(ACCENT), ink)).toBeCloseTo(9.69, 1)
    expect(contrast(rgbOf(ACCENT), ink)).toBeLessThan(contrast(rgbOf(RESISTED_TEAL), ink))
    expect(contrast(rgbOf(ACCENT), ink)).toBeGreaterThan(contrast(rgbOf(OVER_TARGET_RED), ink))
  })
})

describe('the Kicked halo in the dim lane', () => {
  const lilac = dimmed(ACCENT)
  const teal = dimmed(RESISTED_TEAL)
  const paper = dimmed(PAPER)

  it("separates lilac, teal and paper by hue at the lane's own dimness", () => {
    expect(YESTERDAY_OPACITY).toBe(0.42)

    // The 267° / 165° / 30° the spec names, within the rounding of the dim
    // hexes it reads them off.
    expect(Math.abs(hueOf(lilac) - 267)).toBeLessThan(2)
    expect(Math.abs(hueOf(teal) - 165)).toBeLessThan(2)
    expect(Math.abs(hueOf(paper) - 30)).toBeLessThan(2)

    expect(hueGap(lilac, teal)).toBeGreaterThan(60)
    expect(hueGap(lilac, paper)).toBeGreaterThan(60)
    expect(hueGap(teal, paper)).toBeGreaterThan(60)
  })

  it('has no luminance left to separate them with, which is why hue is a constraint', () => {
    // Compositing at 0.42 over near-black preserves hue and destroys luminance:
    // all three pairs land far below the 3:1 a non-text channel would need. So
    // **the accent is not free to be re-toned to a lower-chroma value later** —
    // chroma is the whole mechanism, and this is the test that says so.
    expect(contrast(lilac, teal)).toBeLessThan(1.5)
    expect(contrast(lilac, paper)).toBeLessThan(1.5)
    expect(contrast(teal, paper)).toBeLessThan(1.5)
  })
})
