import type { TradeSuggestion } from "@/types"
import { getCompanySuggestionEntries } from "@/lib/company-hs-catalog"

export const TOP_HS_CODES: { code: string; name: string }[] = [
  { code: "8542", name: "전자집적회로" },
  { code: "8703", name: "승용자동차" },
  { code: "8517", name: "통신기기" },
  { code: "2710", name: "석유제품" },
  { code: "8708", name: "자동차부품" },
  { code: "8507", name: "축전지" },
  { code: "8529", name: "디스플레이 및 TV 부품" },
  { code: "7208", name: "열연강판" },
  { code: "3004", name: "의약품" },
  { code: "9013", name: "광학기기 및 LCD 모듈" },
  { code: "8544", name: "전선 및 케이블" },
  { code: "8471", name: "컴퓨터 및 데이터처리기기" },
  { code: "8411", name: "터보제트 및 가스터빈" },
  { code: "8525", name: "송신기기 및 카메라" },
  { code: "7210", name: "도금강판" },
  { code: "3901", name: "에틸렌 중합체" },
  { code: "2601", name: "철광석" },
  { code: "8479", name: "기타 일반기계" },
  { code: "2814", name: "암모니아" },
  { code: "8716", name: "트레일러 및 세미트레일러" },
]

const DETAILED_HS_CODES: { code: string; name: string; aliases?: string[] }[] = [
  {
    code: "8542321010",
    name: "디램",
    aliases: ["디램", "메모리반도체", "반도체메모리"],
  },
  {
    code: "8542321020",
    name: "에스램",
    aliases: ["에스램", "메모리반도체", "반도체메모리"],
  },
  {
    code: "8542321030",
    name: "플래시메모리",
    aliases: ["플래시메모리", "낸드", "메모리반도체", "반도체메모리"],
  },
  {
    code: "8542310000",
    name: "프로세서 및 컨트롤러",
    aliases: ["프로세서", "컨트롤러", "시스템반도체"],
  },
  {
    code: "8542390000",
    name: "기타 전자집적회로",
    aliases: ["집적회로", "반도체", "전자집적회로"],
  },
]

const TRADE_SUGGESTION_CATALOG: { code: string; name: string; aliases?: string[] }[] = [
  ...TOP_HS_CODES,
  ...DETAILED_HS_CODES,
]

function normalizeKeyword(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\-_/()[\].,]+/g, "")
}

export function normalizeHsCode(value?: string | null): string | undefined {
  if (!value) return undefined

  const digitsOnly = value.replace(/\D/g, "")
  if (digitsOnly.length < 4 || digitsOnly.length > 10) return undefined

  return digitsOnly
}

export function getTradeSuggestions(query: string, limit = 8): TradeSuggestion[] {
  const raw = query.trim()
  if (!raw) return []

  const normalizedHs = raw.replace(/\D/g, "")
  const normalizedKeyword = normalizeKeyword(raw)

  const matchedSuggestions = TRADE_SUGGESTION_CATALOG
    .map((item) => {
      const normalizedName = normalizeKeyword(item.name)
      const normalizedAliases = (item.aliases ?? []).map(normalizeKeyword)
      const isExactHs = normalizedHs.length > 0 && item.code === normalizedHs
      const hsStartsWith = normalizedHs.length > 0 && item.code.startsWith(normalizedHs)
      const hsIncludes = normalizedHs.length > 0 && item.code.includes(normalizedHs)
      const nameStartsWith = normalizedKeyword.length > 0 && normalizedName.startsWith(normalizedKeyword)
      const nameIncludes = normalizedKeyword.length > 0 && normalizedName.includes(normalizedKeyword)
      const aliasStartsWith =
        normalizedKeyword.length > 0 && normalizedAliases.some((alias) => alias.startsWith(normalizedKeyword))
      const aliasIncludes =
        normalizedKeyword.length > 0 && normalizedAliases.some((alias) => alias.includes(normalizedKeyword))

      let score = 0
      let matchType: TradeSuggestion["matchType"] | null = null

      if (isExactHs) {
        score = 1000 - item.code.length
        matchType = "hsCode"
      } else if (hsStartsWith) {
        score = 800 - item.code.length
        matchType = "hsCode"
      } else if (hsIncludes) {
        score = 600 - item.code.length
        matchType = "hsCode"
      } else if (nameStartsWith || aliasStartsWith) {
        score = 400 - item.name.length
        matchType = "productName"
      } else if (nameIncludes || aliasIncludes) {
        score = 200 - item.name.length
        matchType = "productName"
      }

      if (!matchType) return null

      return {
        queryValue: item.code,
        hsCode: item.code,
        productName: item.name,
        matchType,
        score,
      }
    })
    .filter((item) => item !== null)

  const directHsSuggestion =
    normalizedHs.length >= 5 && normalizedHs.length <= 10
      ? {
          queryValue: normalizedHs,
          hsCode: normalizedHs,
          productName: "HS 코드 직접 검색",
          matchType: "hsCode" as const,
          score: 1200 - normalizedHs.length,
        }
      : null

  const companySuggestions = getCompanySuggestionEntries(raw, limit).map((entry) => ({
    queryValue: entry.companyName,
    productName: entry.companyName,
    subtitle: `HS codes ${entry.uniqueCodeCount}`,
    matchType: "company" as const,
    score: entry.score + 50,
  }))

  return [...matchedSuggestions, ...(directHsSuggestion ? [directHsSuggestion] : []), ...companySuggestions]
    .filter((item, index, array) =>
      array.findIndex((candidate) => candidate.matchType === item.matchType && candidate.queryValue === item.queryValue) === index
    )
    .sort((a, b) => {
      const left = "hsCode" in a ? a.hsCode : a.queryValue
      const right = "hsCode" in b ? b.hsCode : b.queryValue
      return b.score - a.score || left.localeCompare(right)
    })
    .slice(0, limit)
    .map((item) => ({
      queryValue: item.queryValue,
      hsCode: "hsCode" in item ? item.hsCode : undefined,
      productName: item.productName,
      subtitle: "subtitle" in item ? item.subtitle : undefined,
      matchType: item.matchType,
    }))
}
