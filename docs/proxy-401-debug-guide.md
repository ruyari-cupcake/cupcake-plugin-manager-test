# CPM 프록시 401 디버그 가이드

> **대상**: CPM v1.22.x에서 역방향 프록시(Reverse Proxy) + 커스텀 모델 사용 시 401 오류를 겪는 사용자

---

## 1. 프록시 모드 이해

CPM은 두 가지 프록시 모드를 지원합니다:

| 모드 | 설정 | 동작 |
|------|------|------|
| **Rewrite** (기본) | `proxyDirect: false` | 프록시 도메인으로 URL 재작성 (경로 유지) |
| **Direct** | `proxyDirect: true` | 프록시 URL로 요청 전송 + `X-Target-URL` 헤더에 원본 URL 포함 |

### Rewrite 모드 예시
```
원본: https://api.openai.com/v1/chat/completions
프록시: https://my-proxy.kr/proxy
결과: https://my-proxy.kr/proxy/v1/chat/completions
헤더: Authorization: Bearer sk-xxx, X-Target-URL: https://api.openai.com/v1/chat/completions
```

### Direct 모드 예시
```
원본: https://api.openai.com/v1/chat/completions
프록시: https://my-proxy.kr/proxy
결과: → 요청이 https://my-proxy.kr/proxy 로 전송됨
헤더: Authorization: Bearer sk-xxx, X-Target-URL: https://api.openai.com/v1/chat/completions
```

---

## 2. 401 오류 원인별 진단

### A. 프록시 인증 누락 (proxyKey)

**증상**: 프록시 자체가 401 반환 (API 엔드포인트에 도달하기 전)

**확인사항**:
- 커스텀 모델 설정에서 `Proxy Access Token` (proxyKey) 필드가 비어있지 않은지 확인
- proxyKey가 설정되면 `X-Proxy-Token` 헤더로 전송됨 (v1.22.11+)
- 프록시 서버가 `X-Proxy-Token` 헤더를 인식하는지 확인

**콘솔 확인**:
```
[Cupcake PM] [direct proxy] → https://my-proxy.kr (target: https://api.openai.com/...)
```
위 로그가 나오면 Direct 모드로 프록시에 요청이 전송된 것. proxyKey가 설정되었다면 `X-Proxy-Token` 헤더가 포함됨.

---

### B. API 키가 프록시를 통해 전달되지 않음

**증상**: 프록시는 통과하지만 실제 API 서버에서 401 반환

**원인**: 프록시가 `Authorization` 헤더를 제거하거나 변경함

**확인사항**:
1. CPM은 항상 `Authorization: Bearer {API_KEY}` 헤더를 포함하여 전송
2. **프록시가 Authorization 헤더를 백엔드로 그대로 전달하는지** 확인
3. CORS 프록시 중 일부는 보안상 Authorization 헤더를 제거함 → 프록시 설정 변경 필요

**Direct 모드에서의 흐름**:
```
CPM → 프록시 (Authorization: Bearer sk-xxx, X-Target-URL: https://api.openai.com/...)
프록시 → OpenAI (Authorization: Bearer sk-xxx)  ← 프록시가 이걸 전달해야 함
```

---

### C. Rewrite 모드에서 프록시가 경로를 잘못 처리

**증상**: 404 또는 401 (잘못된 엔드포인트로 요청됨)

**확인사항**:
1. 프록시 URL에 후행 슬래시 (`/`) 없는지 확인 → CPM이 자동 제거
2. `/api/v1/...` 경로는 자동으로 `/v1/...`으로 변환됨 (프록시 호환성)
3. 콘솔에서 최종 URL 확인:
```
[Cupcake PM] CORS Proxy (Rewrite mode) active → https://my-proxy.kr/proxy/v1/chat/completions
```

---

### D. Copilot URL + 프록시 조합

**증상**: `api.githubcopilot.com` URL에 프록시 사용 시 401

**핵심 차이**:
- **프록시 없이 Copilot**: CPM이 내부적으로 GitHub OAuth → Copilot API 토큰 교환 수행
- **프록시 + Copilot**: CPM이 OAuth 토큰을 `Authorization` + `X-Copilot-Auth` 헤더로 전송. **프록시가 서버 사이드에서 토큰 교환을 해야 함**

**콘솔 확인**:
```
[Cupcake PM] Copilot: Token exchange failed — cannot authenticate.
```
→ 이 메시지는 프록시 없이 직접 Copilot 사용 시 토큰 교환 실패를 의미

**해결책**:
1. Copilot + 프록시: 프록시 서버가 `X-Copilot-Auth` 헤더를 인식하고 토큰 교환 처리 필요
2. 또는 프록시 없이 직접 Copilot 사용 (CPM이 자동 토큰 교환)
3. 수동 커스텀 모델: Copilot이 아닌 다른 OpenAI-호환 URL 사용

---

### E. Anthropic 포맷 + 프록시

**증상**: Anthropic API (`api.anthropic.com`) + 프록시 시 401

**핵심 차이**:
- 직접 Anthropic: `x-api-key` 헤더 사용 (Bearer가 아님)
- 프록시 + Anthropic: `Authorization: Bearer` 사용 + `anthropic-version` 헤더
- **프록시가 헤더를 Anthropic 형식으로 변환해야 할 수 있음**

---

## 3. 디버깅 체크리스트

### 단계별 진단

| # | 확인 항목 | 방법 |
|---|-----------|------|
| 1 | 프록시 URL 형식 정상? | 콘솔: `[CPM Router] ✓ proxyUrl="..."` 확인 |
| 2 | 프록시 모드 확인 | 콘솔: `Direct mode` vs `Rewrite mode` 로그 |
| 3 | 프록시 자체 인증? | `proxyKey` 설정 → `X-Proxy-Token` 헤더 확인 |
| 4 | API 키 전달? | 프록시 서버 로그에서 `Authorization` 헤더 확인 |
| 5 | 최종 URL 정상? | 콘솔: 최종 요청 URL 확인 |
| 6 | 401 출처 확인 | 응답 본문: API 서버 에러 vs 프록시 에러 구분 |

### 콘솔 로그 예시 (정상 흐름)

```
[CPM Router] ✓ proxyUrl="https://my-proxy.kr" for [Test] GPT-4o
[Cupcake PM] CORS Proxy (Direct mode) → proxy=https://my-proxy.kr, target=https://api.openai.com/v1/chat/completions
[Cupcake PM] [direct proxy] → https://my-proxy.kr (target: https://api.openai.com/v1/chat/completions)
```

### 콘솔 로그 예시 (프록시 미설정)
```
[CPM Router] ⚠ proxyUrl is EMPTY for [Test] GPT-4o (uniqueId=..., keys=...)
[Cupcake PM] No proxyUrl configured for https://api.openai.com/... — direct request mode
```

---

## 4. 권장 설정 (모드별)

### 일반적인 CORS 프록시 (인증 불필요)
```
프록시 URL: https://my-cors-proxy.com
Direct 모드: ✅ (권장)
Proxy Access Token: (비워둠)
```

### 인증 필요한 CORS 프록시
```
프록시 URL: https://my-auth-proxy.com
Direct 모드: ✅
Proxy Access Token: your-proxy-secret-token
```

### Cloudflare Worker 프록시
```
프록시 URL: https://my-worker.workers.dev
Direct 모드: ✅ (Worker가 X-Target-URL 처리)
Proxy Access Token: (Worker 인증 토큰, 필요시)
```

---

## 5. v1.22.12 주요 변경사항 (프록시 관련)

| 버전 | 변경 |
|------|------|
| v1.22.11 | `proxyKey` 필드 추가 → `X-Proxy-Token` 헤더 지원 |
| v1.22.12 | `router.js` proxyKey 전달 버그 수정 (v1.22.11에서 proxyKey가 fetchCustom에 전달되지 않던 문제) |

> ⚠️ **v1.22.11 사용자**: `proxyKey`를 설정해도 실제로 `X-Proxy-Token` 헤더가 전송되지 않는 버그가 있었음. v1.22.12로 업데이트 필요.
