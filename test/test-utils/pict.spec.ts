import { describe, expect, it } from 'vitest'
import { accept, buildPictCases, defineVariants, reject } from '@test-utils'

interface ExampleInput {
  mode: 'a' | 'b'
  count: number
}

const variants = defineVariants<ExampleInput>()({
  mode: [
    accept('a', 'a', { baseline: true }),
    accept('b', 'b'),
  ],
  count: [
    accept('one', 1, { baseline: true }),
    accept('zero', 0),
    reject('negative', -1),
  ],
})

describe('buildPictCases', () => {
  it('materializes generated combinations and expectation flags', async () => {
    const cases = await buildPictCases(variants)

    expect(cases.length).toBeGreaterThan(0)
    expect(cases.every(({ id }) => id.startsWith('pict:'))).toBe(true)
    expect(cases.some(({ shouldAccept }) => shouldAccept)).toBe(true)
    expect(cases.some(({ shouldAccept }) => !shouldAccept)).toBe(true)
  })
})
