# Design System

## 1. Design Philosophy

세 가지 레퍼런스의 핵심을 하나의 일관된 언어로 통합한다.

| 레퍼런스 | 차용 영역 | 핵심 원칙 |
|---|---|---|
| **Wealthsimple** | 전반적인 UI / 레이아웃 / 컴포넌트 | 금융 데이터를 단순하고 인간적으로 |
| **Linear** | 대시보드 / 데이터 시각화 / 인터랙션 | 밀도 높은 정보를 노이즈 없이 |
| **Apple** | 브랜드 톤앤매너 / 카피 / 전반적인 무드 | 기술이 아닌 경험을 판다 |

> **One-liner:** "복잡한 주식 데이터를, 누구나 이해하는 명확한 화면으로."

---

## 2. Color System

### Base Palette

```
Background
  --bg-primary:    #FFFFFF       /* 메인 캔버스 */
  --bg-secondary:  #F5F5F7       /* 섹션 배경, 카드 배경 (Apple gray) */
  --bg-tertiary:   #FAFAFA       /* 인풋, 코드 블록 배경 */
  --bg-overlay:    #000000 / 40% /* 모달 딤 */

Surface (Wealthsimple-style cards)
  --surface-1:     #FFFFFF       /* 카드 기본 */
  --surface-2:     #F9F9F9       /* 중첩 카드 */
  --surface-border:#E5E5E7       /* 테두리 */

Text
  --text-primary:  #1D1D1F       /* Apple 본문 검정 */
  --text-secondary:#6E6E73       /* 보조 텍스트 */
  --text-tertiary: #AEAEB2       /* 레이블, placeholder */
  --text-inverse:  #FFFFFF       /* 어두운 배경 위 텍스트 */

Brand Accent (Wealthsimple green)
  --accent:        #00C170       /* CTA, 포지티브 수치, 하이라이트 */
  --accent-light:  #E6FAF3       /* 배지, 배경 틴트 */
  --accent-dark:   #00965A       /* hover 상태 */

Semantic
  --positive:      #00C170       /* 상승, 수익 */
  --negative:      #FF3B30       /* 하락, 손실 */
  --warning:       #FF9F0A       /* 경고 */
  --neutral:       #8E8E93       /* 변동 없음 */

Data Visualization (Linear-style)
  --chart-1:       #5E6AD2       /* Linear purple - 기본 시리즈 */
  --chart-2:       #26B5CE       /* 보조 시리즈 */
  --chart-3:       #F2994A       /* 3번 시리즈 */
  --chart-4:       #BB87FC       /* 4번 시리즈 */
  --chart-grid:    #E5E5E7       /* 차트 그리드 라인 */
  --chart-tooltip: #1D1D1F       /* 툴팁 배경 */
```

### Dark Mode

```
  --bg-primary:    #000000
  --bg-secondary:  #1C1C1E
  --surface-1:     #2C2C2E
  --surface-border:#3A3A3C
  --text-primary:  #F5F5F7
  --text-secondary:#AEAEB2
  --chart-grid:    #3A3A3C
```

---

## 3. Typography

Apple SF Pro 계열을 기반으로 한 시스템 폰트 스택.

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display",
             "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

/* 수치 데이터 전용 (Linear 스타일 - tabular nums) */
font-family-mono: "SF Mono", "Fira Code", "Cascadia Code", monospace;
font-variant-numeric: tabular-nums;
```

### Type Scale

| Token | Size | Weight | Line-height | 용도 |
|---|---|---|---|---|
| `--type-hero` | 56px | 700 | 1.05 | 랜딩 히어로 헤드라인 |
| `--type-h1` | 40px | 700 | 1.1 | 페이지 타이틀 |
| `--type-h2` | 28px | 600 | 1.2 | 섹션 헤딩 |
| `--type-h3` | 20px | 600 | 1.3 | 카드 타이틀 |
| `--type-body-lg` | 17px | 400 | 1.6 | 본문 (Apple 표준) |
| `--type-body` | 15px | 400 | 1.6 | 일반 본문 |
| `--type-label` | 13px | 500 | 1.4 | 라벨, 배지 |
| `--type-caption` | 11px | 400 | 1.4 | 보조 정보, 타임스탬프 |
| `--type-data-lg` | 32px | 700 | 1.0 | 주요 수치 (가격, 수익률) |
| `--type-data` | 20px | 600 | 1.1 | 보조 수치 |

### Tone & Manner (Apple 방식)

- **능동형, 현재형** 동사 사용: "투자하다" → "지금 시작하세요"
- **기술 용어 최소화**: "포트폴리오 최적화 알고리즘" → "당신에게 맞는 구성"
- **숫자는 임팩트 있게**: "수수료 0%" / "3초 만에 거래"
- **여백을 두려워하지 않는다** — 카피는 짧게, 화면은 넓게

---

## 4. Spacing & Layout

8px 기반 스페이싱 시스템.

```
--space-1:   4px
--space-2:   8px
--space-3:   12px
--space-4:   16px
--space-5:   20px
--space-6:   24px
--space-8:   32px
--space-10:  40px
--space-12:  48px
--space-16:  64px
--space-20:  80px
--space-24:  96px
```

### Grid

```
/* 페이지 컨테이너 */
max-width: 1200px
padding: 0 24px          /* mobile */
padding: 0 48px          /* tablet */
padding: 0 80px          /* desktop */

/* 대시보드 그리드 (Linear 스타일) */
columns: 12
gutter:  24px

/* 사이드바 + 콘텐츠 (Linear 레이아웃) */
sidebar: 240px (fixed)
content: fluid
```

---

## 5. Component Library

### 5-1. Navigation

**Global Nav (Wealthsimple 스타일)**
- 배경: `--bg-primary` + `backdrop-filter: blur(20px)` (Apple 헤더)
- 높이: 64px
- 로고 좌측, 주요 링크 중앙, CTA 우측
- 스크롤 시 border-bottom 페이드인

**Sidebar (Linear 스타일)**
- 너비: 240px, 배경: `--bg-secondary`
- 아이콘 + 텍스트 메뉴 아이템 (40px 높이)
- 활성 상태: `--accent-light` 배경 + `--accent` 텍스트
- 그룹 헤딩: `--type-caption` + `--text-tertiary`

### 5-2. Cards

```
/* 기본 카드 (Wealthsimple) */
background:    var(--surface-1)
border:        1px solid var(--surface-border)
border-radius: 16px
padding:       24px
box-shadow:    0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)

/* hover */
box-shadow:    0 4px 12px rgba(0,0,0,0.10)
transform:     translateY(-1px)
transition:    all 200ms ease
```

**카드 구조**
```
CardHeader   — 타이틀 + 보조 액션 (우측 정렬)
CardBody     — 주요 콘텐츠
CardFooter   — 링크 / 버튼 / 타임스탬프 (선택)
```

### 5-3. Data Ticker / Price Display

```
/* 주가 표시 블록 */
.price-primary   — var(--type-data-lg), var(--text-primary)
.price-change    — var(--type-data), positive/negative 색상
.price-percent   — var(--type-label), 배지로 감싸기

/* 배지 */
background: var(--positive/negative) + 15% opacity
color:      var(--positive/negative)
padding:    2px 8px
border-radius: 100px
```

### 5-4. Buttons

```
/* Primary (Wealthsimple green) */
background:    var(--accent)
color:         #FFFFFF
border-radius: 12px
padding:       14px 28px
font-size:     15px, weight 600
hover:         var(--accent-dark), scale(1.01)
active:        scale(0.99)

/* Secondary */
background:    var(--bg-secondary)
color:         var(--text-primary)
border:        1px solid var(--surface-border)

/* Ghost */
background:    transparent
color:         var(--accent)

/* 공통 */
transition:    all 150ms ease
disabled:      opacity 0.4, cursor not-allowed
```

### 5-5. Charts & Data Viz (Linear 스타일)

**Line Chart (기본 주가 차트)**
- 배경: 투명 또는 `--surface-1`
- 그리드: `--chart-grid`, strokeWidth 1, dashed
- 축 텍스트: `--text-tertiary`, `--type-caption`
- 라인: `--chart-1`, strokeWidth 2
- Area fill: `--chart-1` + 8% opacity gradient (상단 → 하단)
- 툴팁: 배경 `--chart-tooltip`, 텍스트 `#FFFFFF`, border-radius 8px, shadow

**Sparkline**
- 높이: 40px, 너비: 100px
- 색상: positive/negative 조건부

**Bar Chart (거래량)**
- 색상: `--chart-2` 기본, `--chart-1` hover
- bar-radius: 4px (상단만)

**Donut Chart (포트폴리오 비중)**
- stroke-width: 24px
- 중앙: 주요 수치 표시
- legend: 우측 또는 하단

### 5-6. Table (Linear 스타일)

```
/* 헤더 */
background:     var(--bg-secondary)
color:          var(--text-tertiary)
font:           var(--type-label), weight 500, uppercase, letter-spacing 0.04em
border-bottom:  1px solid var(--surface-border)
height:         36px

/* 행 */
height:         52px
border-bottom:  1px solid var(--surface-border) + 50% opacity
hover:          background var(--bg-secondary)
transition:     background 100ms

/* 숫자 열 */
font-variant-numeric: tabular-nums
text-align: right
```

### 5-7. Form / Input

```
background:    var(--bg-tertiary)
border:        1.5px solid var(--surface-border)
border-radius: 10px
padding:       12px 16px
font-size:     15px
focus:         border-color var(--accent), box-shadow 0 0 0 3px var(--accent-light)
```

---

## 6. Motion & Animation

Apple의 "느리지 않지만 급하지 않은" 트랜지션.

```css
/* 기본 인터랙션 */
--ease-default:  cubic-bezier(0.25, 0.46, 0.45, 0.94)   /* ease-out */
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1)       /* 약한 스프링 */
--ease-sharp:    cubic-bezier(0.4, 0, 0.2, 1)             /* Material-style */

/* 지속 시간 */
--duration-fast:   100ms   /* hover, 미세 인터랙션 */
--duration-base:   200ms   /* 대부분의 UI 전환 */
--duration-slow:   350ms   /* 모달, 패널 슬라이드 */
--duration-page:   500ms   /* 페이지 전환 */
```

**원칙**
- 데이터 로드: 숫자는 카운트업 애니메이션 (500ms)
- 차트 등장: 라인이 좌→우로 그려지는 draw 애니메이션
- 카드 진입: `opacity 0→1` + `translateY 8px→0` (stagger 50ms)
- 가격 변동: 변경된 셀 배경이 노란색으로 flash 후 페이드아웃

---

## 7. Iconography

- 라이브러리: **Lucide Icons** (Linear와 동일한 라이브러리)
- 스타일: stroke, stroke-width 1.5px
- 크기: 16px (인라인), 20px (버튼/메뉴), 24px (헤딩 앞)
- 색상: 컨텍스트 텍스트 색 상속

---

## 8. Page Templates

### 8-1. 랜딩 페이지 (Apple 무드)

```
[Hero Section]
  - 전폭 배경 (흰색 or 연한 그레이디언트)
  - 56px 볼드 헤드라인 (중앙 정렬)
  - 17px 서브카피 1~2줄
  - Primary CTA 버튼 1개
  - Hero 이미지/목업 (하단 or 우측)

[Feature Sections]
  - 교차 레이아웃 (이미지 좌/우 교대)
  - 각 섹션마다 충분한 vertical padding (96px↑)
  - 기능보다 혜택 중심 카피

[Social Proof]
  - 수치 강조 3-up (e.g. "0% 수수료 / 3초 거래 / 14만 사용자")
```

### 8-2. 대시보드 (Linear 무드)

```
[Sidebar] 240px fixed
  - 로고
  - 주요 메뉴 (홈, 포트폴리오, 종목탐색, 뉴스, 설정)
  - 하단: 사용자 프로필

[Main Area]
  ┌─────────────────────────────────┐
  │  Page Header (타이틀 + 필터/액션) │
  ├────────────┬────────────────────┤
  │  KPI Cards │  KPI Cards         │  ← 상단 요약 지표
  ├────────────┴────────────────────┤
  │  메인 차트 (주가 그래프)           │  ← 전폭
  ├────────────────┬────────────────┤
  │  포트폴리오 테이블 │  사이드 패널   │  ← 8:4 분할
  └────────────────┴────────────────┘

[KPI Card 예시]
  - 타이틀: "총 자산"
  - 수치: "₩ 12,340,000"
  - 변동: "+2.3% 오늘"
```

### 8-3. 종목 상세 페이지

```
[상단 헤더]
  - 종목명 + 티커 + 거래소
  - 현재가 (대형) + 등락폭
  - 기간 탭 (1D / 1W / 1M / 3M / 1Y / ALL)

[차트 영역]
  - 인터랙티브 라인 차트 (전폭)
  - hover 시 툴팁 + 크로스헤어

[하단 2-컬럼]
  - 좌: 재무 지표 테이블
  - 우: 관련 뉴스 / 애널리스트 의견
```

---

## 9. Responsive Breakpoints

```
--bp-mobile:  375px   /* 기준 */
--bp-tablet:  768px
--bp-desktop: 1024px
--bp-wide:    1280px
```

- **Mobile**: 사이드바 → 하단 탭바, 카드 1열, 차트 높이 축소
- **Tablet**: 사이드바 아이콘만 표시(64px), 카드 2열
- **Desktop**: 풀 레이아웃

---

## 10. Brand Voice (Apple 방식 적용)

| 상황 | 피해야 할 표현 | 써야 할 표현 |
|---|---|---|
| 로딩 중 | "데이터를 불러오는 중입니다" | "잠깐만요" |
| 에러 | "오류가 발생했습니다 (ERR_404)" | "이 페이지를 찾을 수 없어요" |
| 빈 화면 | "데이터 없음" | "아직 거래 내역이 없어요. 첫 투자를 시작해보세요." |
| CTA | "제출하기" | "시작하기" / "확인하기" |
| 성공 | "완료되었습니다" | "됐어요!" |

---

## 11. Accessibility

- 색상 대비: WCAG AA 이상 (본문 4.5:1, 대형텍스트 3:1)
- 포커스 링: `outline: 2px solid var(--accent); outline-offset: 3px`
- 모든 인터랙티브 요소: 최소 터치 영역 44×44px
- 차트: 색상 외 패턴/레이블로 구분 (색맹 대응)
- `prefers-reduced-motion`: 애니메이션 비활성화 옵션 제공
