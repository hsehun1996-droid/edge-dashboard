import hsExcelMap from "@/data/hs-excel-map.json"

const GENERIC_EXACT = new Set([
  "\uAE30\uD0C0",
  "\uAE30\uD0C0\uC758 \uAC83",
  "\uADF8 \uBC16\uC758 \uAC83",
  "-",
  "",
])

const GENERIC_CONTAINS = [
  "\uAE30\uB85D\uC774\uC548\uB41C",
  "\uAE30\uB85D\uC774 \uC548 \uB41C",
  "\uADF8\uBC16\uC758",
  "\uADF8 \uBC16\uC758",
  "\uAE30\uD0C0\uC758",
  "\uAE30\uD0C0 \uC758",
  "\uC18C\uD638 \uC81C",
  "\uD638\uC758 \uAC83",
]

const map = new Map<string, string>(Object.entries(hsExcelMap as Record<string, string>))

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function isGenericProductName(name: string): boolean {
  if (!name) return true

  const trimmed = normalizeName(name)
  if (GENERIC_EXACT.has(trimmed)) return true

  return GENERIC_CONTAINS.some((pattern) => trimmed.includes(pattern))
}

export function lookupHsName(hsCode: string): string | undefined {
  const digits = hsCode.replace(/\D/g, "")

  for (let len = Math.min(digits.length, 10); len >= 4; len -= 1) {
    const name = map.get(digits.slice(0, len))
    if (name) return name
  }

  return undefined
}
