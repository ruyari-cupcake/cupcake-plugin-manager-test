# cupcake-plugin-manager

> ## ⛔ AI 에이전트 필독 — 절대 규칙 ⛔
>
> **`origin/main` (본서버)에 절대로 push하지 마라.**
>
> - 모든 작업(버그픽스, 기능추가, 테스트)은 반드시 **`test2/main` (테스트서버)** 에만 push한다.
> - 본서버(`origin/main`)는 **사용자가 직접 명시적으로 "본서버에 올려"라고 말한 경우에만** push한다.
> - **본서버 push 시: `test2`와 `origin` 둘 다 push한다.**
> - 이 규칙은 어떤 상황에서도 예외 없이 적용된다.
> - `git push`를 할 때 반드시 remote와 branch를 확인하라. 기본 push 대상이 `origin/main`이므로 주의.
>
> **위반 시 사용자에게 실제 피해가 발생한다 (자동 업데이트로 다른 사용자에게 전파됨).**

**Cupcake Provider Manager (CPM)** is a RisuAI V3 plugin that acts as a meta-framework for managing multiple AI provider backends (OpenAI, Anthropic, Gemini, Vertex AI, AWS Bedrock, DeepSeek, OpenRouter, GitHub Copilot, etc.) via sub-plugins.

## Features

- Multi-provider management via sub-plugin architecture
- Key rotation with automatic failover (429/529/503)
- Auxiliary slot system (translation, emotion, memory, etc.)
- Dynamic model fetching from provider APIs
- Settings backup & persistence across reinstalls
- SSE streaming helpers & message formatting utilities
- Hot-reload for sub-plugins without restarting RisuAI

## Security & Safety

> **TL;DR — CPM은 RisuAI V3 iframe 샌드박스 안에서 실행되며, 사용자의 시스템이나 브라우저 데이터에 접근할 수 없습니다.**

CPM은 CSP nonce 기반 `<script>` 태그 주입 방식으로 서브 플러그인을 로드합니다. 이전에 사용하던 `eval()` 대신 V3 호스트의 CSP 정책과 호환되는 방식으로 전환되었습니다. 보안 분석 결과를 투명하게 공개합니다:

### RisuAI V3 다중 보안 레이어

| Layer | Protection |
|-------|-----------|
| **iframe Sandbox** | `allow-same-origin` 미포함 → null origin, 호스트 DOM/쿠키/localStorage 접근 불가 |
| **CSP** | `connect-src 'none'` → 직접 네트워크 요청(fetch, XHR, WebSocket) 전면 차단 |
| **RPC Bridge** | 모든 API 호출은 postMessage 기반 RPC Proxy를 통해 직렬화됨 |
| **Host API Restrictions** | URL 블랙리스트, SafeElement 래핑, 권한 검사 적용 |

### Nonce 기반 코드 실행이 안전한 이유

1. **iframe 안에서 실행** — 서브 플러그인 코드는 이미 격리된 sandbox iframe 내부에서 nonce가 부여된 `<script>` 태그로 실행됩니다. sandbox 탈출 경로를 열지 않습니다.
2. **CSP와 호환** — V3 호스트의 Content-Security-Policy nonce를 자동 추출하여 사용하므로 CSP 위반 없이 안전하게 실행됩니다.
3. **사용자 동의 기반** — 모든 서브 플러그인은 사용자가 직접 설치(파일 업로드 또는 업데이트 버튼 클릭)한 코드만 실행합니다.
4. **업데이트 안전장치** — 원격 코드의 `@name`이 대상 플러그인과 일치하지 않으면 업데이트가 차단되며, SHA-256 무결성 검증도 수행됩니다.

### 서브 플러그인 코드 vs 일반 코드 비교

| 항목 | 서브 플러그인 (`<script nonce>`) | 일반 iframe 코드 |
|------|-------------------------------|----------------|
| 호스트 DOM 접근 | ❌ 불가 | ❌ 불가 |
| 호스트 localStorage | ❌ 불가 | ❌ 불가 |
| 직접 fetch() | ❌ CSP 차단 | ❌ CSP 차단 |
| window.parent 접근 | ❌ cross-origin 차단 | ❌ cross-origin 차단 |

> 📄 보안 분석 히스토리: [Issue #4](https://github.com/ruyari-cupcake/cupcake-plugin-manager/issues/4) (초기 eval() 기반 → 현재 nonce 기반 `<script>` 전환)

## Documentation

- [PLUGIN_GUIDE.md](PLUGIN_GUIDE.md) — Sub-plugin development guide (CPM API reference, examples, architecture)
- [DEPLOY.md](DEPLOY.md) — Deployment guide (test/production workflow, Vercel, URL pinning)
- [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) — Repository/deployment file separation checklist
- [DATA_OWNERSHIP_POLICY.md](DATA_OWNERSHIP_POLICY.md) — Data ownership policy (purge scope, key prefixes)
- [클플_프록시.md](클플_프록시.md) — Cloudflare Workers 기반 Copilot 프록시 자가배포 가이드

## Development

### Prerequisites

- **Node.js** 20 or 22 (CI tested on both)
- **npm** 9+

### Setup

```bash
git clone https://github.com/ruyari-cupcake/cupcake-plugin-manager.git
cd cupcake-plugin-manager
npm ci            # Install dependencies (lockfile-based, deterministic)
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run lint` | ESLint 검사 (src/ + tests/) |
| `npm run typecheck` | TypeScript 타입 검사 (checkJs, noEmit) |
| `npm test` | Vitest 전체 테스트 실행 |
| `npm run test:release-sync` | 배포 산출물 동기화 회귀 테스트 |
| `npm run test:coverage` | 테스트 커버리지 리포트 |
| `npm run verify:release-sync` | `package.json`↔배포본↔번들↔해시 메타데이터 동기화 검증 |
| `npm run build` | Rollup → `dist/provider-manager.js` (IIFE 번들, 테스트 URL) |
| `npm run build:production` | 프로덕션 URL로 빌드 (`CPM_ENV=production`, cross-platform) |
| `node scripts/release.cjs` | 통합 릴리스: build → dist→root 복사 → 버전 검증 → 번들 생성 → 테스트 → 해시 |

### Quality Gates / Readiness Validation

프로덕션 관련 변경을 만졌다면 아래 4개는 한 세트로 확인하는 것을 권장합니다.

1. `npm test`
2. `npm run test:coverage` → 현재 기준 전체 브랜치 커버리지 `90%`
3. `npm run verify:release-sync`
4. `node scripts/release.cjs`

특히 아래 파일을 건드렸다면 커버리지와 릴리스 동기화를 같이 확인해야 합니다.

- `src/lib/fetch-custom.js`
- `src/lib/smart-fetch.js`
- `src/lib/auto-updater.js`
- `src/cpm-url.config.js`
- `rollup.config.mjs`

### Readiness audit fixes — 운영 가이드

프로덕션 readiness audit에서 반영된 QW/HD 항목은 아래처럼 검증하면 됩니다.

| 항목 | 무엇이 바뀌었나 | 변경 후 확인 방법 |
|------|------------------|-------------------|
| QW-1 | Node 20+ 요구사항을 `package.json` `engines`로 강제 | `npm install` 시 engines 경고/검증 확인, CI Node 20/22 통과 확인 |
| QW-2 | `fetch-custom.js` 재시도에 `Retry-After` 우선 + 지수 백오프 추가 | `npm test`, `npm run test:coverage` 실행 후 fetch 관련 테스트/커버리지 확인 |
| HD-1 | `CPM_ENV` 기준으로 test / production URL을 빌드 타임에 고정 | `npm run build`와 `npm run build:production` 각각 1회 실행 후 `dist/provider-manager.js`의 `@update-url`/런타임 URL 확인 |
| HD-2 | fetch / smart-fetch / auto-updater / env 분기 테스트 보강 | `npm run test:coverage`에서 전체 브랜치 `90%` 이상 유지 확인 |

릴리스 직전에는 가능하면 아래 순서를 그대로 사용하세요.

1. `npm test`
2. `npm run test:coverage`
3. `npm run verify:release-sync`
4. `node scripts/release.cjs` 또는 production이면 현재 `CPM_ENV`를 유지한 채 실행

### Build Output

`npm run build` 실행 시 `dist/provider-manager.js` 에 단일 IIFE 번들이 생성됩니다.  
`node scripts/release.cjs`를 사용하면 빌드부터 root 복사, 버전 검증, update-bundle.json 생성, 테스트, release-hashes.json 기록까지 한 번에 수행됩니다.  
root의 `provider-manager.js`를 RisuAI → 설정 → 플러그인 → + 버튼으로 설치하면 됩니다.

### Build Environments (CPM_ENV)

배포 대상 URL은 `CPM_ENV` 환경변수로 빌드 타임에 결정됩니다. 소스 파일 수정이 필요 없으므로 실수로 프로덕션 URL이 테스트서버에 올라가거나 그 반대가 되는 사고를 방지합니다.

| CPM_ENV | URL | 용도 |
|---------|-----|------|
| `test2` (기본값) | `test-2-gzzwcegiw-preyari94-9916s-projects.vercel.app` | 개발 / 테스트 |
| `test` | `cupcake-plugin-manager-test.vercel.app` | 레거시 (사용 자제) |
| `production` | `cupcake-plugin-manager.vercel.app` | 프로덕션 배포 |

```bash
npm run build               # test2 URL (기본값)
npm run build:production    # 프로덕션 URL (cross-platform 래퍼)
CPM_ENV=production npm run build  # 수동 지정 (Linux/Mac)
```

Windows PowerShell에서 수동으로 production을 고정하려면:

```powershell
$env:CPM_ENV="production"
npm run build
node scripts/release.cjs
```

빌드 시 `@update-url` 헤더와 번들 내 모든 런타임 URL이 자동으로 치환됩니다.  
자세한 배포 절차는 [DEPLOY.md](DEPLOY.md)를 참고하세요.

디버깅 시에는 `dist/provider-manager.js`의 헤더 `@update-url`과 런타임 엔드포인트 문자열이 같은 환경(test/production)을 가리키는지 함께 확인하세요.

### Deployment (Vercel)

프로젝트 루트에 `vercel.json`이 포함되어 있어 Vercel에 직접 배포 가능합니다.

```bash
npx vercel          # Preview 배포
npx vercel --prod   # Production 배포
```

서버리스 함수:
- `/api/main-plugin` — 메인 플러그인 다운로드 (자동 업데이트용)
- `/api/versions` — 경량 버전 매니페스트 (자동 업데이트 알림용)
- `/api/update-bundle` — 전체 업데이트 번들 (버전 + 코드)

### Git Hooks

Husky가 설정되어 있어:

- 커밋 시 변경된 `.js` 파일에 대해 ESLint가 실행됩니다.
- 푸시 전에는 `npm run build` + `npm run verify:release-sync` + `npm run test:release-sync`가 실행됩니다.

즉, 소스만 수정하고 [provider-manager.js](provider-manager.js), [update-bundle.json](update-bundle.json), [release-hashes.json](release-hashes.json), [versions.json](versions.json) 중 하나라도 덜 갱신되면 푸시가 차단됩니다.

## License

See individual plugin files for license information.