export type VariantExpectation = 'accept' | 'reject'

export type AcceptVariant<T> = Readonly<{
  name: string
  value: T
  expected: 'accept'
  baseline?: boolean
  category?: string
}>

export type RejectVariant = Readonly<{
  name: string
  value: unknown
  expected: 'reject'
  baseline?: false
  category?: string
}>

export type FieldVariant<T> = AcceptVariant<T> | RejectVariant

export type VariantMap<T extends object> = {
  readonly [K in keyof T]-?: readonly FieldVariant<T[K]>[]
}

export type VariantCaseValues<T extends object> = {
  [K in keyof T]: unknown
}

export type VariantCaseSelection<T extends object> = {
  [K in keyof T]: FieldVariant<T[K]>
}

export interface VariantCase<T extends object> {
  id: string
  values: VariantCaseValues<T>
  variants: VariantCaseSelection<T>
  shouldAccept: boolean
}

export function accept<T>(
  name: string,
  value: T,
  options: { baseline?: boolean; category?: string } = {},
): AcceptVariant<T> {
  return {
    name,
    value,
    expected: 'accept',
    ...options,
  }
}

export function reject(
  name: string,
  value: unknown,
  options: { category?: string } = {},
): RejectVariant {
  return {
    name,
    value,
    expected: 'reject',
    ...options,
  }
}

export function defineVariants<T extends object>() {
  return <TVariants extends VariantMap<T>>(variants: TVariants): TVariants => {
    assertVariantMap(variants)
    return variants
  }
}

export function assertVariantMap<T extends object>(variants: VariantMap<T>): void {
  for (const [field, fieldVariants] of Object.entries(variants)) {
    if (fieldVariants.length === 0) {
      throw new Error(`Variant definition for "${field}" must not be empty.`)
    }

    const baselines = fieldVariants.filter(
      (variant) => variant.expected === 'accept' && variant.baseline === true,
    )

    if (baselines.length !== 1) {
      throw new Error(
        `Variant definition for "${field}" must contain exactly one accepted baseline variant.`,
      )
    }
  }
}

export function buildRobustnessCases<T extends object>(
  variants: VariantMap<T>,
): VariantCase<T>[] {
  assertVariantMap(variants)

  const baseline = getBaselineSelection(variants)
  const cases: VariantCase<T>[] = [materializeVariantCase('robustness:baseline', baseline)]

  for (const key of Object.keys(variants) as Array<keyof T>) {
    for (const variant of variants[key]) {
      if (variant.expected === 'accept' && variant.baseline === true) {
        continue
      }

      const selection = {
        ...baseline,
        [key]: variant,
      } as VariantCaseSelection<T>

      cases.push(
        materializeVariantCase(`robustness:${String(key)}=${variant.name}`, selection),
      )
    }
  }

  return cases
}

export function materializeVariantCase<T extends object>(
  id: string,
  selection: VariantCaseSelection<T>,
): VariantCase<T> {
  const values = {} as VariantCaseValues<T>
  let shouldAccept = true

  for (const key of Object.keys(selection) as Array<keyof T>) {
    const variant = selection[key]
    values[key] = variant.value
    shouldAccept &&= variant.expected === 'accept'
  }

  return {
    id,
    values,
    variants: selection,
    shouldAccept,
  }
}

export function formatVariantCaseId<T extends object>(
  prefix: string,
  selection: VariantCaseSelection<T>,
): string {
  const suffix = (Object.keys(selection) as Array<keyof T>)
    .map((key) => `${String(key)}=${selection[key].name}`)
    .join(',')

  return `${prefix}:${suffix}`
}

function getBaselineSelection<T extends object>(
  variants: VariantMap<T>,
): VariantCaseSelection<T> {
  const selection = {} as VariantCaseSelection<T>

  for (const key of Object.keys(variants) as Array<keyof T>) {
    const baseline = variants[key].find(
      (variant) => variant.expected === 'accept' && variant.baseline === true,
    )

    if (!baseline) {
      throw new Error(`Accepted baseline variant not found for "${String(key)}".`)
    }

    selection[key] = baseline
  }

  return selection
}
