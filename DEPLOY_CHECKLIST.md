# Cupcake Plugin Manager — 저장소 / 배포 분리 체크리스트

> 이 문서는 두 가지를 분리해서 관리한다.
>
> 1. 저장소에 추적해야 하는 파일
> 2. 실제 공개 배포물에 포함할 파일

---

## 1. 저장소에 추적해야 하는 것

아래는 개발·검증·마이그레이션을 위해 **Git 저장소에 남겨야 하는 소스 원본**이다.

| 범주 | 예시 |
|------|------|
| 소스 | `src/`, `scripts/`, `api/` |
| 테스트 / 품질 | `tests/`, `.github/`, `.husky/`, `coverage/` 제외 설정 파일들 |
| 빌드 / 타입체크 설정 | `package.json`, `package-lock.json`, `rollup.config.mjs`, `eslint.config.js`, `vitest.config.js`, `jsconfig.json`, `tsconfig.typecheck.json`, `.lintstagedrc.json` |
| 문서 | `README.md`, `PLUGIN_GUIDE.md`, `DEPLOY_CHECKLIST.md` |
| 배포 산출물 메타 | `versions.json`, `update-bundle.json`, `vercel.json`, 필요 시 `release-hashes.json` |
| 최종 산출물 | `provider-manager.js`, `cpm-*.js` |

핵심 원칙:

- `src/`와 설정 파일은 **배포 대상이 아닐 수는 있어도 저장소 추적 대상**이다.
- 마이그레이션 전에는 “지금 돌아가는 근거”를 최대한 저장소에 남기는 편이 안전하다.
- `.gitignore`는 로컬/생성물만 제외하고, 소스 원본은 제외하지 않는다.

---

## 2. 공개 배포물에 포함할 것

실제 사용자에게 전달하거나 원격 업데이트 API가 참조하는 파일만 따로 관리한다.

| 파일 | 설명 |
|------|------|
| `provider-manager.js` | 루트에 놓인 메인 플러그인 배포본 |
| `cpm-*.js` | 루트에 놓인 서브 플러그인 배포본 |
| `versions.json` | 원격 버전 메타데이터 |
| `update-bundle.json` | 업데이트 번들 |
| `vercel.json` | 배포 환경 설정 |
| `api/versions.js` | 버전 조회 API |
| `api/update-bundle.js` | 번들 제공 API |

주의:

- 저장소에 있다고 해서 모두 공개 배포물에 넣는 것은 아니다.
- 배포 방식이 바뀌면 이 목록도 함께 바뀔 수 있다.
- 현재처럼 마이그레이션 예정인 단계에서는 “저장소 추적”과 “공개 배포”를 절대 같은 의미로 취급하지 않는다.

---

## 3. 저장소와 배포 둘 다 제외할 것

아래는 로컬 산출물 또는 불필요한 임시 파일이다.

- `node_modules/`
- `dist/`
- `coverage/`
- `*복사본*`, `*.bak`, `*.backup*`
- `backup_before_*/`, `pr6_test/`
- 개인 설정 덤프 (`cupcake_pm_settings*.json` 등)
- 민감 정보가 포함된 임시 파일

---

## 4. 작업 순서

1. `src/`에서 수정
2. 필요 시 테스트 / 린트 / 타입체크 수행
3. 배포본이 필요한 변경이면 루트 `provider-manager.js`, `cpm-*.js`, `versions.json`, `update-bundle.json` 동기화
4. 마이그레이션 전까지는 **소스 원본 보존**을 우선

---

## 5. 푸시 전 확인

```bash
# 1) 소스 원본이 추적되고 있는지 확인
git ls-files | sort

# 2) 로컬 산출물이 추적되지 않는지 확인
git status --ignored

# 3) 배포 메타데이터가 필요한 경우에만 최신인지 확인
#    - versions.json
#    - update-bundle.json

# 4) provider-manager.js가 최신 빌드본인지 확인
#    - 필요 시 root와 dist 해시 비교
```

---

## 6. 기억할 원칙

- `.gitignore`는 “저장소에 남길지”를 결정한다.
- 배포 체크리스트는 “사용자에게 보낼지”를 결정한다.
- 둘은 같은 질문이 아니다.
- 마이그레이션 직전 단계에서는 소스와 설정을 저장소에서 숨기면 나중에 복구 비용이 더 커진다.
