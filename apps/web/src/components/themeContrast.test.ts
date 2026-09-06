import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEMES } from './theme'

const stylesheet = readFileSync(new URL('../themes.css', import.meta.url), 'utf8')
function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map(value => {
    const channel = parseInt(value, 16) / 255
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  })
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}

describe.each(THEMES)('$name readability', theme => {
  const block = stylesheet.match(new RegExp(`\\[data-theme="${theme.id}"\\]\\s*\\{([^}]+)`))![1]
  const tokens = Object.fromEntries([...block.matchAll(/--theme-([\w-]+):\s*(#[\da-f]{6});/gi)].map(match => [match[1], match[2]]))
  const pairs = [
    ['ink','paper'], ['ink','control'], ['muted','paper'], ['muted','control'],
    ['muted','canvas'], ['muted','surface-muted'], ['accent','accent-faint'],
    ['on-strong','accent-strong'], ['on-strong','accent-hover'],
    ['hero-ink','hero-bg'], ['hero-muted','hero-bg'], ['hero-muted','hero-tint'],
    ['secondary-ink','secondary'],
  ]
  it.each(pairs)('%s on %s meets normal-text contrast', (text, surface) => {
    expect(contrast(tokens[text], tokens[surface]), `${theme.id}: ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps controls and progress visually distinguishable', () => {
    expect(contrast(tokens['control-border'], tokens.control)).toBeGreaterThanOrEqual(3)
    expect(contrast(tokens['hero-accent'], tokens['hero-track'])).toBeGreaterThanOrEqual(3)
  })
  it('uses the canvas color for the browser and Android safe areas', () => {
    expect(theme.browserColor.toLowerCase()).toBe(tokens.canvas.toLowerCase())
  })
})
