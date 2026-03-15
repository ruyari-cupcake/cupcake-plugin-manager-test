# Oracle 프록시 실제 구현 설계서

## 문서 목적

이 문서는 기존 Cloudflare Workers 기반 `copilot-anthropic-proxy` 아이디어를 **Oracle Ubuntu VM에서 장기 운영 가능한 Node.js 프록시**로 구현하기 위한 실제 개발 기준서다.

목표는 다음 4가지다.

1. 브라우저/RisuAI/웹뷰/로컬/도커 환경에서 CORS 문제 없이 사용 가능
2. 장시간 스트리밍(SSE, chunked response) 안정 처리
3. 공개 오픈 프록시화 방지
4. 요청 본문/응답 본문 미저장 원칙 유지

---

## 범위

### 포함
- Node.js 프록시 서버
- Nginx 리버스 프록시
- Copilot/Anthropic 호환 메시지 프록시 라우트
- CORS 처리
- 인증/레이트리밋/업스트림 allowlist
- 무상태(stateless) 운영
- Oracle VM 배포 기준

### 제외
- 사용자 계정 시스템
- 대시보드 UI
- 결제/과금 시스템
- 장기 로그 저장 파이프라인

---

## 권장 런타임 스택

- OS: Ubuntu 22.04 LTS
- Node.js: 22 LTS
- Reverse Proxy: Nginx
- App Framework: Fastify
- HTTP client: Undici 내장 `fetch`
- Process Manager: systemd
- TLS: Nginx + Let's Encrypt

선정 이유:
- Fastify는 저부하/저메모리 환경에서 유리하다.
- Node 22는 Web Streams / fetch / AbortController 지원이 안정적이다.
- Nginx가 TLS 종료, 기본 rate-limit, request size 제한, idle timeout 제어를 맡는다.

---

## 상위 아키텍처

```text
Client (Web / RisuAI / Mobile WebView / Local / Docker)
    -> HTTPS
Nginx
    -> /health
    -> /v1/messages
    -> /v1/models
    -> /proxy/*
Node Fastify App
    -> Auth check
    -> Origin/CORS policy
    -> Request validation
    -> Rate limit / quota guard
    -> Upstream routing
    -> Token acquisition (Copilot only)
    -> Streaming passthrough
Upstream APIs
    -> GitHub Copilot internal token endpoint
    -> GitHub Copilot messages endpoint
    -> Anthropic endpoint (optional direct path)
```

---

## 저장 금지 원칙

### 저장하지 않는 것
- 사용자 프롬프트 본문
- 업스트림 응답 본문
- API 키 원문
- 쿠키 원문
- Authorization 헤더 원문

### 남겨도 되는 것
- 요청 시각
- 라우트명
- 응답 상태코드
- 처리 시간(ms)
- 업스트림 종류(`copilot`, `anthropic`)
- 요청 바이트 수 / 응답 바이트 수
- 해시 처리된 클라이언트 식별자

### 로그 마스킹 규칙
- `Authorization`, `x-api-key`, `Cookie`, `Set-Cookie`는 무조건 마스킹
- 에러 로그에도 본문 직렬화 금지
- 디버그 모드에서도 본문 로깅 금지

---

## 디렉터리 구조 제안

```text
proxy/
  package.json
  .env.example
  src/
    app.js
    config.js
    server.js
    routes/
      health.js
      models.js
      messages.js
    services/
      copilot-token.js
      upstream-proxy.js
      auth.js
      rate-limit.js
      cors.js
      request-guards.js
    utils/
      logger.js
      stream.js
      sanitize.js
      errors.js
  deploy/
    nginx.conf
    systemd/cupcake-proxy.service
    logrotate/cupcake-proxy
  tests/
    health.test.js
    messages.test.js
    auth.test.js
    cors.test.js
    streaming.test.js
```

---

## 환경 변수 설계

필수:

- `PORT=8787`
- `HOST=127.0.0.1`
- `NODE_ENV=production`
- `PROXY_SHARED_SECRET=...`
- `ALLOWED_ORIGINS=*`
- `MAX_REQUEST_BYTES=10485760`
- `REQUEST_TIMEOUT_MS=180000`
- `STREAM_IDLE_TIMEOUT_MS=240000`
- `UPSTREAM_CONNECT_TIMEOUT_MS=15000`
- `COPILOT_TOKEN_URL=https://api.github.com/copilot_internal/v2/token`
- `COPILOT_API_BASE=https://api.githubcopilot.com`
- `ANTHROPIC_API_BASE=https://api.anthropic.com`

선택:

- `TRUST_PROXY=true`
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX_REQUESTS=30`
- `RATE_LIMIT_MAX_CONCURRENT=5`
- `ENABLE_DIRECT_ANTHROPIC=false`
- `ENABLE_MODELS_ROUTE=true`
- `ACCESS_LOG_ENABLED=true`
- `JSON_LOGS=true`

권장 규칙:
- 공개 인스턴스라도 최소한 `PROXY_SHARED_SECRET`는 유지
- `ALLOWED_ORIGINS=*`가 필요하더라도 비밀 없이 누구나 쓰는 오픈 릴레이는 금지

---

## 외부 공개 API 계약

### 1. `GET /health`
목적: 헬스체크

응답 예시:

```json
{
  "ok": true,
  "service": "cupcake-proxy",
  "version": "1.0.0",
  "uptimeSec": 1234
}
```

### 2. `GET /v1/models`
목적: 최소 호환 모델 목록 제공

응답 원칙:
- 정적/캐시 가능
- 민감정보 없음
- Copilot 전용/Anthropic 전용 모델 분리 가능

### 3. `POST /v1/messages`
목적: Claude 호환 요청 수신 후 업스트림으로 전달

입력:
- `Authorization: Bearer <shared-secret or access token>`
- `Content-Type: application/json`
- 본문은 Claude `messages` 호환

출력:
- 비스트리밍이면 JSON 반환
- 스트리밍이면 `text/event-stream` 그대로 전달

### 4. `OPTIONS *`
목적: 프리플라이트 대응

---

## 인증 설계

### 기본 정책
공개 CORS와 공개 사용은 다르다. CORS를 열어도 사용 자체는 인증되어야 한다.

### 권장 1차 방식: 공유 비밀
클라이언트는 아래 중 하나로 비밀 전달:
- `Authorization: Bearer <PROXY_SHARED_SECRET>`
- 또는 `x-proxy-secret: <PROXY_SHARED_SECRET>`

### 향후 확장 가능 방식
- 사용자별 API key 발급
- HMAC timestamp 서명
- 짧은 TTL access token

### 차단 규칙
- 비밀 누락 시 `401`
- 비밀 불일치 시 `403`
- 허용되지 않은 라우트 접근 시 `404`

---

## CORS 설계

### 기본 응답 헤더
- `Access-Control-Allow-Origin: <origin or *>`
- `Vary: Origin`
- `Access-Control-Allow-Headers: Authorization, Content-Type, X-API-Key, X-Proxy-Secret, Anthropic-Version`
- `Access-Control-Allow-Methods: GET,POST,OPTIONS`
- `Access-Control-Expose-Headers: Content-Type, X-Request-Id`

### 정책
- 브라우저 호환 우선이면 `*` 허용 가능
- 단, credential 기반 쿠키 인증은 사용하지 않는다
- 인증은 header token 방식만 사용

---

## 요청 검증 규칙

모든 `POST /v1/messages` 요청에 대해:

1. `Content-Type`이 `application/json`인지 확인
2. 바디 크기가 `MAX_REQUEST_BYTES` 이하인지 확인
3. JSON parse 실패 시 `400`
4. 최상위 구조가 객체인지 확인
5. `messages`가 배열인지 확인
6. `stream`이 있으면 boolean인지 확인
7. 도구/이미지/오디오 필드는 허용 스키마만 통과
8. 서버가 모르는 필드는 필요 시 제거 후 전달

권장 구현:
- 완전 strict reject보다 **sanitize + 최소 검증** 조합
- 단, 파일 업로드/바이너리/멀티파트는 기본 범위에서 제외

---

## 업스트림 라우팅 설계

### Copilot 경로
1. 클라이언트 요청 수신
2. 클라이언트가 보낸 외부용 Copilot 토큰 또는 GitHub 토큰 검증
3. `copilot_internal/v2/token` 호출
4. 획득한 internal token으로 `api.githubcopilot.com/v1/messages` 호출
5. 응답을 스트림 포함 그대로 전달

### Direct Anthropic 경로 (선택)
1. `ENABLE_DIRECT_ANTHROPIC=true`일 때만 활성화
2. 서버는 업스트림 API key를 저장하지 않음
3. 클라이언트가 보낸 `x-api-key`를 단순 중계하거나 별도 서버 키 사용 여부를 명시적으로 결정
4. `anthropic-version` 등 필수 헤더 검증 후 전달

### 절대 금지
- 임의 URL 프록시 (`/proxy?url=` 형태)
- 전체 인터넷 대상 open relay
- 사용자가 지정한 호스트로 자유 전달

---

## 스트리밍 처리 설계

### 요구사항
- SSE 응답 중간 버퍼링 최소화
- 백프레셔 존중
- 클라이언트 연결 종료 시 업스트림도 abort
- 업스트림 idle timeout 감시

### 구현 규칙
- Node fetch 응답 `body`를 그대로 Fastify `reply.send()`에 연결
- `stream=true`이면 `content-type`를 업스트림 기준으로 복사
- `transfer-encoding`, `connection`, `content-length` 등 hop-by-hop 헤더는 제거
- 클라이언트 `close` 이벤트에서 `AbortController.abort()` 호출

### 타임아웃 권장값
- connect timeout: 15초
- first byte timeout: 60초
- stream idle timeout: 240초
- absolute request timeout: 180초~300초

---

## 보안 통제 체크리스트

### 네트워크
- Nginx는 80/443만 외부 개방
- Node 앱 포트는 `127.0.0.1` 바인딩
- UFW 또는 OCI Security List에서 불필요 포트 차단

### 앱 보안
- `helmet`류 보안 헤더는 API 특성상 최소 적용
- request size 제한 강제
- origin allowlist 또는 wildcard 정책 명시
- shared secret 필수
- IP 단위 + 토큰 단위 rate limit
- 동시 연결 수 제한
- 잘못된 JSON/대형 요청 조기 차단

### 운영 보안
- `.env`는 repo 미포함
- systemd service 계정 분리
- sudo 없는 전용 사용자 실행
- core dump 비활성화 권장
- 로그 파일 권한 제한

### 업스트림 안전장치
- 대상 호스트 하드코딩 allowlist
- DNS rebinding 방지 위해 사용자 입력 URL 금지
- redirect 비활성 또는 제한
- upstream response header 그대로 전부 노출 금지

---

## Nginx 구성 요구사항

### 역할
- TLS 종료
- 클라이언트 바디 크기 제한
- 기본 rate-limit
- SSE friendly proxying
- 공통 access log

### 핵심 설정 포인트
- `client_max_body_size 10m;`
- `proxy_http_version 1.1;`
- `proxy_request_buffering off;`
- `proxy_buffering off;`
- `proxy_read_timeout 300s;`
- `proxy_send_timeout 300s;`
- `/health`는 짧은 timeout
- `/v1/messages`는 스트리밍용 긴 timeout

---

## systemd 운영 요구사항

서비스명 예시: `cupcake-proxy.service`

필수 항목:
- WorkingDirectory 지정
- EnvironmentFile=.env 지정
- Restart=always
- RestartSec=3
- KillSignal=SIGINT
- TimeoutStopSec=20
- StandardOutput=append:/var/log/cupcake-proxy/access.log`
- `StandardError=append:/var/log/cupcake-proxy/error.log`

운영 원칙:
- 앱은 크래시 시 자동 재기동
- 배포는 `systemctl restart cupcake-proxy`
- 로그 로테이션 별도 설정

---

## 오류 응답 규격

모든 오류는 JSON 고정:

```json
{
  "error": {
    "type": "bad_request",
    "message": "Invalid messages payload",
    "requestId": "req_..."
  }
}
```

오류 종류 예시:
- `bad_request`
- `unauthorized`
- `forbidden`
- `rate_limited`
- `upstream_timeout`
- `upstream_error`
- `internal_error`

원칙:
- 클라이언트에 내부 stack trace 노출 금지
- 대신 `requestId` 제공

---

## 관측성 최소 기준

### 메트릭
최소 수집 항목:
- 총 요청 수
- 2xx/4xx/5xx 카운트
- 업스트림별 요청 수
- 평균/95p 지연시간
- 활성 스트림 수
- rate-limit 차단 수

### 로그 예시 필드
- `ts`
- `requestId`
- `route`
- `method`
- `statusCode`
- `durationMs`
- `upstream`
- `clientHash`
- `stream`

---

## 구현 단계 제안

### Phase 1 — 최소 동작 버전
- `GET /health`
- `OPTIONS` 처리
- `POST /v1/messages`
- shared secret 인증
- Copilot token 획득
- 비스트리밍/스트리밍 passthrough
- 요청 크기 제한
- 마스킹 로그

### Phase 2 — 운영 안전장치
- Nginx rate limit
- 앱 레벨 동시성 제한
- request id 부여
- structured logs
- `/v1/models`
- idle timeout 감시

### Phase 3 — 안정화
- 통합 테스트
- 재시도 정책(토큰 endpoint만 제한적)
- systemd/logrotate 배포 파일 정리
- 배포 스크립트 작성

---

## 테스트 계획

### 단위 테스트
- 인증 성공/실패
- 잘못된 JSON 거부
- 큰 요청 차단
- CORS preflight 응답 검증
- upstream host allowlist 검증

### 통합 테스트
- non-stream JSON passthrough
- SSE passthrough
- 클라이언트 abort 시 upstream abort
- Copilot token 실패 처리
- upstream 429/500 전달 정책

### 실제 환경 테스트
- 브라우저 fetch
- RisuAI 환경
- 모바일 웹뷰
- 로컬 Node 호출
- 느린 네트워크 환경에서 stream 안정성

---

## 배포 절차 요약

1. Oracle Ubuntu VM 준비
2. Node 22 / Nginx 설치
3. 전용 사용자 생성
4. 소스 배포
5. `.env` 작성
6. `npm ci --omit=dev` 또는 프로덕션 설치
7. systemd service 등록
8. Nginx site 등록
9. TLS 발급
10. `/health` 확인
11. 실제 `POST /v1/messages` smoke test

---

## 오픈 이슈

1. Copilot upstream 인증에 사용할 최종 사용자 토큰 형식 확정 필요
2. direct Anthropic 경로를 실제로 열지 여부 결정 필요
3. 사용자별 quota가 필요한지 정책 결정 필요
4. 단일 VM 한계 도달 시 수평 확장 또는 캐시/LB 도입 필요

---

## 구현 완료 정의

다음을 만족하면 1차 구현 완료로 본다.

- 브라우저에서 CORS 오류 없이 `POST /v1/messages` 호출 가능
- SSE 응답이 100초 이상 안정 유지 가능
- 본문 로그 저장 없음
- shared secret 없이는 사용 불가
- healthcheck 및 기본 관측성 확보
- Oracle VM 재부팅 후 systemd로 자동 기동
