/**
 * 서버 사이드 인메모리 캐시
 *
 * - TTL 기반 만료
 * - In-flight 중복 제거: 동일 키에 대한 동시 요청이 몰려도 외부 API는 1번만 호출
 * - 추가 인프라(Redis 등) 없이 단일 프로세스 내에서 동작
 */

type CacheEntry<T> = {
  data: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

/**
 * 캐시에서 데이터를 가져오거나, 없으면 fn()을 실행해 저장합니다.
 *
 * @param key    캐시 키
 * @param ttlMs  유효 시간 (밀리초)
 * @param fn     실제 데이터를 가져오는 함수
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  // 1. 유효한 캐시 히트
  const hit = store.get(key) as CacheEntry<T> | undefined
  if (hit && Date.now() < hit.expiresAt) return hit.data

  // 2. 이미 진행 중인 동일 요청이 있으면 그 Promise를 공유
  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) return pending

  // 3. 새 요청 시작
  const promise = fn()
    .then((data) => {
      store.set(key, { data, expiresAt: Date.now() + ttlMs })
      inflight.delete(key)
      return data
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })

  inflight.set(key, promise as Promise<unknown>)
  return promise
}

/** 특정 키의 캐시를 즉시 무효화합니다. */
export function invalidateCache(key: string): void {
  store.delete(key)
  // inflight는 건드리지 않음 (진행 중인 요청은 완료 후 덮어씀)
}

/** 모든 캐시를 초기화합니다. */
export function clearAllCache(): void {
  store.clear()
}
