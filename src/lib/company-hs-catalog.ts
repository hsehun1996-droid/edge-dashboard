import rawCatalog from "@/data/company-hs-catalog.json"

export interface CompanyHsItem {
  productName: string
  hsCode: string
  normalizedHsCode: string
}

export interface CompanyHsCatalogEntry {
  companyName: string
  items: CompanyHsItem[]
}

const COMPANY_HS_CATALOG = rawCatalog as CompanyHsCatalogEntry[]

function normalizeCompanyKeyword(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\-_/()[\].,]+/g, "")
}

export function getCompanyHsCatalog() {
  return COMPANY_HS_CATALOG
}

export function findCompanyByQuery(query: string) {
  const normalizedQuery = normalizeCompanyKeyword(query.trim())
  if (!normalizedQuery) return undefined

  return COMPANY_HS_CATALOG.find(
    (entry) => normalizeCompanyKeyword(entry.companyName) === normalizedQuery
  )
}

export function getCompanySuggestionEntries(query: string, limit = 8) {
  const normalizedQuery = normalizeCompanyKeyword(query.trim())
  if (!normalizedQuery) return []

  return COMPANY_HS_CATALOG
    .map((entry) => {
      const normalizedName = normalizeCompanyKeyword(entry.companyName)
      const uniqueCodeCount = new Set(entry.items.map((item) => item.normalizedHsCode)).size
      const startsWith = normalizedName.startsWith(normalizedQuery)
      const includes = normalizedName.includes(normalizedQuery)

      if (!startsWith && !includes) return null

      return {
        companyName: entry.companyName,
        uniqueCodeCount,
        score: startsWith ? 1000 - entry.companyName.length : 700 - entry.companyName.length,
      }
    })
    .filter((entry): entry is { companyName: string; uniqueCodeCount: number; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score || a.companyName.localeCompare(b.companyName))
    .slice(0, limit)
}

export function getCompanyNormalizedHsCodes(companyName: string) {
  const entry = findCompanyByQuery(companyName)
  if (!entry) return []

  const normalizedCodes = Array.from(
    new Set(
      entry.items
        .map((item) => item.normalizedHsCode)
        .filter((code) => code.length >= 4 && code.length <= 10)
    )
  )

  return normalizedCodes.filter(
    (code) => !normalizedCodes.some((candidate) => candidate !== code && candidate.startsWith(code))
  )
}
