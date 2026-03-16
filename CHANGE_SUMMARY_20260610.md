# CPM v1.20.16 버그 수정 — 최종 변경 요약서

**작성일**: 2026-06-10  
**대상**: CPM (Cupcake Provider Manager) v1.20.16  
**감사 방식**: RisuAI 오픈소스(`Risuai-main/`) 대비 교차 검증  

---

## 1. 수정된 버그 (7건)

### A 카테고리 — 로직 오류 (4건)

| ID | 심각도 | 수정 파일 | 내용 |
|----|--------|----------|------|
| **A001** | HIGH | `stream-utils.js` | `checkStreamCapability` Phase 2 정규식 윈도우 800→3000자 확대. 긴 `collectTransferables` 함수에서 `ReadableStream` 참조를 놓치던 false positive 해결 |
| **A002** | MEDIUM | `format-openai.js` | `mergesys` 모드에서 시스템 메시지만 있을 때 내용이 소실되던 버그 수정. 합성 user 메시지로 보존 |
| **A003** | MEDIUM | `fetch-custom.js` | 메시지 deep-clone(`JSON.parse(JSON.stringify())`) 실패 시 계속 진행하던 문제 → 즉시 에러 반환으로 변경 |
| **A004** | MEDIUM | `fetch-custom.js` | 키 풀(key pool) 이름에 모델명만 사용하던 것을 `URL + 모델명`으로 변경. 동일 모델명을 쓰는 서로 다른 엔드포인트 간 키 오염 방지 |

### B 카테고리 — V3 API 불일치 (1건)

| ID | 심각도 | 수정 파일 | 내용 |
|----|--------|----------|------|
| **B001** | MEDIUM | `format-gemini.js` | Gemini 3 모델에서 `thinking_tokens` budget만 설정하고 level을 안 줬을 때 thinking이 완전히 무시되던 버그. RisuAI `google.ts` L360-371과 동일한 budget→level 변환 로직 추가 (Flash: 4096/16384, Pro: 8192 임계값) |

### C 카테고리 — 엣지케이스 (2건)

| ID | 심각도 | 수정 파일 | 내용 |
|----|--------|----------|------|
| **C003** | MEDIUM | `stream-builders.js` | SSE 라인 분리 시 `\n`만 처리하던 것을 `\r?\n`으로 변경. CRLF를 보내는 API 서버에서 파싱 실패하던 문제 해결 |
| **C004** | MEDIUM | `fetch-custom.js` | 5MB 경고만 있던 바디 크기 제한에 10MB 하드 리밋 추가. V3 브릿지 데이터 잘림으로 인한 "unexpected EOF" 방지 |

---

## 2. 수정하지 않은 것 (의도적 제외)

| 항목 | 사유 |
|------|------|
| Gemini 안전 설정 `OFF` 사용 | 의도적 설계 (사용자 확인) |
| Vertex Gemini 3 글로벌 엔드포인트 강제 | 의도적 설계 (사용자 확인) |
| 서브 플러그인 샌드박스/권한 이슈 | 의도적 제외 (사용자 확인) |
| BUG-C001 Copilot compat 모드 스킵 | 의도적 — 코드 주석 L3772-3775에 근거 (Copilot은 반드시 nativeFetch 사용) |

---

## 3. 수정 파일 목록

### 소스 파일 (src/lib/)
- `src/lib/stream-utils.js` — A001 (정규식 확대)
- `src/lib/format-openai.js` — A002 (mergesys 합성 user)
- `src/lib/format-gemini.js` — B001 (Gemini 3 budget→level)
- `src/lib/stream-builders.js` — C003 (CRLF 지원, 2곳)
- `src/lib/fetch-custom.js` — A003 + A004 + C004 (deep-clone, 키풀, 10MB 리밋)

### 번들/배포 파일
- `provider-manager.js` — Rollup 리빌드로 자동 반영
- `dist/provider-manager.js` — 루트와 동일 (복사)
- `release-hashes.json` — SHA256 해시 갱신 (`a6d418...`)
- `update-bundle.json` — 번들 코드 + 해시 갱신

### 테스트 파일
- `tests/bugfix-audit-20260609.test.js` — 39 tests (7건 버그 전용)
- `tests/edge-cases-20260610.test.js` — 56 tests (추가 엣지케이스)
- 기존 테스트 9건 수정 — 사전 존재하던 잘못된 기대값 보정:
  - Anthropic `"System:"` 대문자 (5건) → 실제 코드와 RisuAI 모두 대문자 사용
  - Anthropic `claude1HourCaching` TTL (3건) → `{type:'ephemeral', ttl:'1h'}` 이 정확한 값
  - OpenAI `mergesys` 빈 배열 (1건) → 합성 user 메시지 반환이 정확한 동작

---

## 4. 테스트 결과

| 항목 | 수치 |
|------|------|
| 테스트 파일 | 122개 |
| 전체 테스트 | **3426 / 3426 PASS** |
| 신규 추가 | 95 tests (39 + 56) |
| 기존 보정 | 9 tests (기대값 수정) |
| Statement 커버리지 | 95.03% |
| Branch 커버리지 | 88.43% |
| Function 커버리지 | 95.94% |
| Line 커버리지 | 96.42% |

---

## 5. Rollup 리빌드 검증

| 확인 항목 | 결과 |
|----------|------|
| `npm run build` (rollup) 성공 | ✅ |
| 7건 수정 전부 빌드 번들에 반영 확인 | ✅ |
| `provider-manager.js` === `dist/provider-manager.js` | ✅ |
| `release-hashes.json` SHA256 일치 | ✅ |
| `update-bundle.json` 코드+해시 일치 | ✅ |
| 리빌드 후 3426/3426 테스트 통과 | ✅ |

---

## 6. 배포 참고

- **환경**: 현재 `_env = 'test'` (테스트 서버 전용)
- **업데이트 URL**: `cupcake-plugin-manager-test.vercel.app/api/main-plugin`
- **버전**: `package.json` → `1.20.16`
- **본서버(production) 푸쉬 금지** — 추가 검증 후 별도 진행
