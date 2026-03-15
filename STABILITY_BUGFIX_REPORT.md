# Cupcake Provider Manager — 안정성 버그 수정 보고서

**작성일:** 2026-03-13  
**대상:** `_temp_repo` (cupcake-provider-manager v1.20.0)  
**작성 목적:** 종합 감사에서 발견된 최우선 9개 이슈를 문서화하고 수정 방침을 기록한다.

---

## 목표

기능 안정성·무결성·복구성·디버깅 가능성을 저해하는 최우선 9개 버그를 수정하여, 정상 경로뿐 아니라 실패 경로에서도 올바르게 동작하도록 한다.

## 맥락

- 전수 코드 감사에서 총 29개 이슈(CRITICAL 1 / HIGH 4 / MEDIUM 12 / LOW 9 / INFO 3)를 발견함.
- "배포자는 혼자"라는 전제 하에 외부 공격면 위주 항목(sub-plugin uiHtml XSS, window 전역 토큰 등)은 후순위로 조정.
- 아래 9건은 **기능 파손·무결성·복구 불가·디버깅 불능·자해형 장애** 성격으로 배포 주체와 무관하게 위험함.

## 필수 조건

- 기존 동작을 깨뜨리지 않는 **방어적, 최소 범위** 수정만 한다.
- 각 수정은 독립적으로 검증 가능해야 한다.
- 기존 테스트(vitest)가 통과해야 한다.

## 금지 사항

1. 대규모 구조 리팩터링 금지 — 수정 대상 함수 범위 안에서만 변경
2. 새로운 기능 추가 금지 — 버그 수정과 직접 관련 없는 코드 변경 불가
3. 기존 테스트를 깨뜨리거나 삭제하지 않음

## 출력 형식

- 각 파일에 직접 인라인 패치 적용
- 본 보고서에 수정 전후 diff 요약 기록

## 검증 기준

- `npm run lint` (ESLint) 통과
- `npm test` (vitest) 기존 테스트 전부 통과
- 수정 후 런타임에서 해당 경로가 정상 동작 (로그 확인)

---

## 수정 대상 목록

### Fix 1 — `_deepSanitizeBody`에서 tool-calling 속성 보존 [CRITICAL → 기능 파손]

**파일:** `src/lib/smart-fetch.js` (L357–375)  
**증상:** `risuFetch` 경로에서 `tool_calls`, `tool_call_id`, `function_call` 등이 누락되어 tool-calling 대화가 깨짐.  
**수정:** safeMsg 구성 시 `tool_calls`, `tool_call_id`, `function_call`, `refusal` 속성을 보존.

### Fix 2 — 직접 다운로드 폴백에 SHA-256 검증 추가 [CRITICAL → 무결성]

**파일:** `src/lib/auto-updater.js` (L505–562)  
**증상:** 번들 다운로드 실패 시 폴백 경로에서 무결성 검증 없이 JS 코드를 설치.  
**수정:** 폴백 경로에서도 `mainEntry.sha256`이 존재하면 해시 비교 후 불일치 시 거부.

### Fix 3 — `setApiRequestLogger` 연결 [HIGH → 디버깅 불능]

**파일:** `src/lib/init.js` (L10, L103 부근)  
**증상:** stream-builders.js의 `_logFn`이 null이라 스트리밍 응답 로그가 전혀 기록되지 않음.  
**수정:** init.js에서 `setApiRequestLogger(updateApiRequest)` 호출 추가.

### Fix 4a — 에러 폴백 `onclick` 핸들러 수정 [MEDIUM → 복구 불가]

**파일:** `src/lib/init.js` (L416)  
**증상:** 인라인 `onclick`에서 모듈 스코프 `Risu`를 참조하여 `ReferenceError` 발생, 닫기 버튼 작동 불가.  
**수정:** `window.risuai?.hideContainer?.()` 또는 `(window.risuai||window.Risuai)?.hideContainer?.()` 사용.

### Fix 4b — `Risu` null 가드 추가 [MEDIUM → TypeError]

**파일:** `src/lib/smart-fetch.js` (L181, L201, L232, L248)  
**증상:** `Risu`가 undefined일 때 `typeof Risu.nativeFetch`에서 TypeError 발생.  
**수정:** 각 가드에 `Risu &&` 접두 조건 추가.

### Fix 5a — KeyPool 소진 후 쿨다운 [MEDIUM → 자해형 장애]

**파일:** `src/lib/key-pool.js` (L104–107, L220–223)  
**증상:** 모든 키 소진 시 즉시 reset → 다음 호출에서 같은 실패 키 재사용 → 무한 429 루프.  
**수정:** reset 시 쿨다운 타임스탬프 기록, pick에서 쿨다운 기간 중 빈 문자열 반환.

### Fix 5b — Copilot 토큰 교환 실패 시 네거티브 캐시 [MEDIUM → 자해형 장애]

**파일:** `src/lib/copilot-token.js` (L78–108)  
**증상:** 토큰 교환 실패 시 캐시가 갱신되지 않아 매 요청마다 동일 실패 재시도.  
**수정:** 실패 시 60초 네거티브 캐시 설정.

### Fix 6 — `cpm_streaming_show_thinking` 죽은 설정 연결 [HIGH → 잘못된 사용자 신뢰]

**파일:** `src/lib/stream-builders.js` (Anthropic 스트림 빌더)  
**증상:** 설정 체크박스가 존재하나 실제로 읽히지 않아, thinking 토큰이 항상 표시됨.  
**수정:** Anthropic 스트림 빌더에서 `cpm_streaming_show_thinking` 설정을 읽어 false면 thinking 블록 스킵.

### Fix 7 — Gemini 파라미터 검증 오류 수정 [MEDIUM → 데이터 손실]

**파일:** `src/lib/format-gemini.js` (L44–48)  
**증상:** `frequencyPenalty`/`presencePenalty` 경계값 2.0이 유효임에도 삭제됨, `topK` max가 40으로 너무 낮음.  
**수정:** `exclusiveMax: false`로 변경, `topK` max를 64로 변경.

### Fix 8 — Anthropic `cache_control` TTL 형식 수정 [MEDIUM → 기능 미동작]

**파일:** `src/lib/format-anthropic.js` (L157–158)  
**증상:** `{ type: 'ephemeral', ttl: '1h' }`는 Anthropic API 비표준 → 무시되어 기본 5분 캐시.  
**수정:** 올바른 Anthropic 형식인 `{ type: 'ephemeral' }`로 통일 (1시간 TTL는 API 미지원이므로 삭제하거나 주석으로 기록).

### Fix 9 — `stripStaleAutoCaption` 과도한 제거 방지 [MEDIUM → 데이터 손실]

**파일:** `src/lib/sanitize.js` (L55)  
**증상:** 이미지 키워드가 텍스트 어딘가에 있으면 마지막 `[...]` 블록이 무조건 삭제됨.  
**수정:** 삭제 대상 괄호 내용 자체가 이미지 설명 패턴인지 추가 검증.

---

## 수정 결과 요약

| # | 파일 | 상태 |
|---|------|------|
| Fix 1 | `src/lib/smart-fetch.js` | ✅ 완료 |
| Fix 2 | `src/lib/auto-updater.js` | ✅ 완료 |
| Fix 3 | `src/lib/init.js` | ✅ 완료 |
| Fix 4a | `src/lib/init.js` | ✅ 완료 |
| Fix 4b | `src/lib/smart-fetch.js` | ✅ 완료 |
| Fix 5a | `src/lib/key-pool.js` | ✅ 완료 |
| Fix 5b | `src/lib/copilot-token.js` | ✅ 완료 |
| Fix 6 | `src/lib/stream-builders.js` + `src/lib/fetch-custom.js` | ✅ 완료 |
| Fix 7 | `src/lib/format-gemini.js` | ✅ 완료 |
| Fix 8 | `src/lib/format-anthropic.js` | ✅ 완료 |
| Fix 9 | `src/lib/sanitize.js` | ✅ 완료 |

**검증:** `npm run lint` — 통과 / `npm test` — 71 파일 1740 테스트 전부 통과
