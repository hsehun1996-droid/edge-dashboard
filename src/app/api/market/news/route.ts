import { NextResponse } from "next/server"
import type { NewsItem } from "@/types"

const NAVER_FINANCE_NEWS_URL = "https://finance.naver.com/news/mainnews.naver"
const BASE_URL = "https://finance.naver.com"
const MAX_PAGES = 10
const REVALIDATE_SECONDS = 15 * 60

const REQUEST_HEADERS = {
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://finance.naver.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
}

interface ParsedArticle {
  title: string
  summary: string
  source: string
  url: string
  publishedAt: string
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

function stripHtml(value: string | undefined): string {
  if (!value) return ""

  return decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function scoreSentiment(text: string): NewsItem["sentiment"] {
  const positiveTerms = ["상승", "급등", "강세", "반등", "호실적", "최고", "신고가", "확대"]
  const negativeTerms = ["하락", "급락", "약세", "부진", "우려", "충격", "축소", "둔화"]

  const positiveHits = positiveTerms.filter((term) => text.includes(term)).length
  const negativeHits = negativeTerms.filter((term) => text.includes(term)).length

  if (positiveHits > negativeHits) return "positive"
  if (negativeHits > positiveHits) return "negative"
  return "neutral"
}

function toAbsoluteUrl(url: string): string {
  if (!url) return ""
  return url.startsWith("http://") || url.startsWith("https://") ? url : `${BASE_URL}${url}`
}

function parsePublishedAt(value: string): string {
  const normalized = value.trim().replace(" ", "T")
  const parsed = new Date(`${normalized}+09:00`)

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString()
  }

  return parsed.toISOString()
}

function extractMatch(source: string, pattern: RegExp): string {
  return source.match(pattern)?.[1]?.trim() ?? ""
}

function parseArticleBlock(block: string): ParsedArticle | null {
  const title = stripHtml(
    extractMatch(
      block,
      /<dd class="articleSubject">[\s\S]*?<a [^>]*href="[^"]+"[^>]*>([\s\S]*?)<\/a>/
    )
  )
  const href = extractMatch(
    block,
    /<dd class="articleSubject">[\s\S]*?<a [^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/
  )
  const summary = stripHtml(
    extractMatch(block, /<dd class="articleSummary">([\s\S]*?)<span class="press">/)
  )
  const source = stripHtml(extractMatch(block, /<span class="press">([\s\S]*?)<\/span>/))
  const publishedAt = parsePublishedAt(extractMatch(block, /<span class="wdate">([\s\S]*?)<\/span>/))
  const url = toAbsoluteUrl(href)

  if (!title || !url) {
    return null
  }

  return {
    title,
    summary,
    source: source || "네이버 증권",
    url,
    publishedAt,
  }
}

function parseFinanceNewsPage(html: string): ParsedArticle[] {
  const blocks = html.match(/<li class="block1">[\s\S]*?<\/li>/g) ?? []

  return blocks
    .map(parseArticleBlock)
    .filter((item): item is ParsedArticle => item !== null)
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()

  return items.filter((item) => {
    const key = `${item.title}|${item.url}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function fetchFinanceNewsPage(page: number): Promise<NewsItem[]> {
  const params = new URLSearchParams({ page: String(page) })
  const response = await fetch(`${NAVER_FINANCE_NEWS_URL}?${params.toString()}`, {
    headers: REQUEST_HEADERS,
    next: { revalidate: REVALIDATE_SECONDS },
  })

  if (!response.ok) {
    throw new Error(`Naver Finance news error on page ${page}: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const html = new TextDecoder("euc-kr").decode(buffer)
  const articles = parseFinanceNewsPage(html)

  return articles.map((article) => {
    const sentiment = scoreSentiment(`${article.title} ${article.summary}`)

    return {
      id: `${article.publishedAt}:${article.url}`,
      country: "KR",
      title: article.title,
      summary: article.summary,
      source: article.source,
      url: article.url,
      publishedAt: article.publishedAt,
      sentiment,
    } satisfies NewsItem
  })
}

async function fetchNaverFinanceNews(): Promise<NewsItem[]> {
  const pageNumbers = Array.from({ length: MAX_PAGES }, (_, index) => index + 1)
  const results = await Promise.allSettled(pageNumbers.map((page) => fetchFinanceNewsPage(page)))

  return dedupeNews(
    results
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  )
}

function mockNews(): NewsItem[] {
  const now = new Date().toISOString()

  return [
    {
      id: "mock-1",
      country: "KR",
      title: "네이버 증권 뉴스 연결을 확인하는 중입니다.",
      summary: "실시간 뉴스 소스를 불러오지 못하면 이 항목이 임시로 표시됩니다.",
      source: "시스템",
      url: "#",
      publishedAt: now,
      sentiment: "neutral",
    },
  ]
}

export async function GET() {
  const timestamp = new Date().toISOString()

  try {
    const news = await fetchNaverFinanceNews()

    if (news.length > 0) {
      return NextResponse.json({
        data: news,
        timestamp,
        source: "naver-finance",
      })
    }
  } catch (error) {
    console.error("Failed to fetch market news from Naver Finance", error)
  }

  return NextResponse.json({
    data: mockNews(),
    timestamp,
    source: "mock",
  })
}
