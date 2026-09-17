import { pict } from 'pict-node'
import {
  assertVariantMap,
  formatVariantCaseId,
  materializeVariantCase,
  type FieldVariant,
  type VariantCase,
  type VariantCaseSelection,
  type VariantMap,
} from './variants.js'

export interface PictCaseOptions {
  order?: number
}

export async function buildPictCases<T extends object>(
  variants: VariantMap<T>,
  options: PictCaseOptions = {},
): Promise<VariantCase<T>[]> {
  assertVariantMap(variants)

  const model = (Object.keys(variants) as Array<keyof T>).map((key) => ({
    key: String(key),
    values: [...variants[key]],
  }))

  const generated = await pict(
    { model },
    { order: options.order ?? 2 },
  )

  return generated.map((row) => {
    const selection = {} as VariantCaseSelection<T>

    for (const key of Object.keys(variants) as Array<keyof T>) {
      selection[key] = row[String(key)] as FieldVariant<T[typeof key]>
    }

    return materializeVariantCase(
      formatVariantCaseId('pict', selection),
      selection,
    )
  })
}
