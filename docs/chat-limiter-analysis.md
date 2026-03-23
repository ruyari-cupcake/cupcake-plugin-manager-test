# Chat Limiter 기능 분석 보고서

## 1. 원본 플러그인: chat-view-fold-v3_2.0.5

### 핵심 메커니즘 (추출 대상)

**CSS-only nth-child 기법으로 채팅 제한:**

```css
/* keepCount = 6일 때 생성되는 CSS */
.flex-col-reverse > .chat-message-container:nth-child(n+7) {
    display: none !important;
}
```

- `.flex-col-reverse`는 RisuAI의 채팅 컨테이너 (역순 flex)
- `.chat-message-container`는 개별 메시지 요소
- `:nth-child(n+7)`로 7번째 이후 메시지를 모두 숨김
- 역순 flex이므로 **최신 메시지가 앞쪽**, 오래된 메시지가 뒤쪽 → 최신 N개만 보여줌

### 성능 원리

| 기법 | 효과 |
|------|------|
| CSS `display: none` | 브라우저 레이아웃/페인트에서 제외 → 렌더링 비용 제거 |
| 단일 `<style>` 태그 주입 | 메시지별 JS 조작 불필요 |
| 순수 CSS 선택자 | JavaScript 리플로우 없음 |

> **참고**: Svelte가 내부적으로 컴포넌트를 추적하지만, 실제 렌더링 성능은 브라우저의 레이아웃/페인트 단계에서 결정. `display: none`은 이 단계를 건너뛰므로 실효적으로 렉을 제거함. 기존 chat-view-fold 플러그인이 이미 이 방식으로 동작 중.

### 원본의 전체 기능 (사용자가 불필요하다고 판단)

- ❌ 접기/펼치기 토글 버튼 UI
- ❌ 키보드 단축키 (Alt+F 등)
- ❌ 자동 스크롤 (새 메시지 생성 시)
- ❌ 점선 구분선 UI
- ❌ 첫 번째 메시지(시스템) 숨기기 옵션
- ✅ **채팅 N개만 표시** ← 이것만 필요

### CSS 선택자 탐지 순서

```javascript
const CSS_SELECTORS = [
    '.flex-col-reverse > .chat-message-container',   // 기본 (99% 적중)
    '.chat-message-list > .chat-message-container',  // 대체
    '[class*="chat"] > [class*="message"]',          // 범용 폴백
    '.message-container'                              // 최후 수단
];
```

### 사용하는 RisuAI v3 API

| API | 용도 |
|-----|------|
| `risuai.getRootDocument()` | DOM 접근 |
| `risuai.getArgument(key)` | 설정값 읽기 |
| `risuai.safeLocalStorage` | 상태 저장 |
| `risuai.registerButton()` | 버튼 등록 |
| `risuai.addEventListener()` | 이벤트 리스닝 |
| `risuai.addRisuScriptHandler('display')` | 디스플레이 훅 |
| `risuai.onUnload()` | 정리 콜백 |

---

## 2. RisuAI v3 플러그인 API 검증 (risuai-main 오픈소스 기준)

### 확인된 API

| API | 상태 | 비고 |
|-----|------|------|
| `risuai.getRootDocument()` | ✅ 존재 | `SafeDocument` 반환 |
| `risuai.getArgument()` | ✅ 존재 | 플러그인 설정값 |
| `risuai.safeLocalStorage` | ✅ 존재 | `safe_plugin_` 접두사로 저장 |
| `risuai.registerButton()` | ✅ 존재 | location: 'hamburger', 'chat', 'action' |
| `risuai.onUnload()` | ✅ 존재 | 클린업 콜백 |
| `createElement('style')` | ✅ 가능 | CSP에서 `style-src * 'unsafe-inline'` 허용 |
| DOM `querySelector` | ✅ 가능 | `SafeElement` 래퍼 통해 |
| `display` 핸들러 | ✅ 존재 | 채팅 표시 전 실행 |

### 보안 제한사항

- 커스텀 속성: `x-*` 접두사만 허용
- HTML 직접 삽입: DOMPurify 자동 정화
- 네트워크: `risuai.nativeFetch()` 필요 (CSP가 direct fetch 차단)
- `<style>` 태그: 허용됨 (화이트리스트에 포함)

### 실제 DOM 구조 (Chats.svelte 확인)

```html
<div class="flex flex-col-reverse ...">
    <div class="chat-message-container" x-hashed="...">메시지1</div>
    <div class="chat-message-container" x-hashed="...">메시지2</div>
    ...
</div>
```

---

## 3. 결론

**추출 가능성: ✅ 100% 가능**

- 핵심 메커니즘은 CSS nth-child 선택자 1줄
- 필요한 API 모두 v3에서 지원
- 독립 플러그인 또는 CPM 서브플러그인 모두 가능
- 예상 코드량: ~50-80줄 (원본 450줄+ 대비 80% 감소)
