import { describe, expect, it } from 'vitest'
import { accept, buildRobustnessCases, defineVariants, reject } from '@test-utils'

interface ExampleInput {
  name: string
  enabled: boolean
}

const variants = defineVariants<ExampleInput>()({
  name: [
    accept('normal', 'example', { baseline: true }),
    accept('empty', ''),
    reject('null', null),
  ],
  enabled: [
    accept('enabled', true, { baseline: true }),
    accept('disabled', false),
    reject('string', 'true'),
  ],
})

describe('buildRobustnessCases', () => {
  it('builds baseline plus one-field substitutions', () => {
    const cases = buildRobustnessCases(variants)

    expect(cases).toHaveLength(5)
    expect(cases[0]).toMatchObject({
      id: 'robustness:baseline',
      values: { name: 'example', enabled: true },
      shouldAccept: true,
    })
    expect(cases.find(({ id }) => id === 'robustness:name=null')?.shouldAccept).toBe(false)
    expect(cases.find(({ id }) => id === 'robustness:enabled=string')?.shouldAccept).toBe(false)
  })
})
