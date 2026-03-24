# Chat Limiter × Chat Navigation 충돌 분석 보고서

## 개요
- **분석 대상**: `cpm-chat-limiter.js` (v0.2.1) × `cpm-chat-navigation.js` (v2.1.5)
- **증상**: Chat Limiter로 메시지를 가린 후 Chat Navigation이 정상 작동하지 않음
- **심각도**: 🔴 HIGH — 핵심 상호작용 결함
- **교차검증**: RisuAI 오픈소스 (`Risuai-main/`) SafeElement API 소스 코드와 대조 완료

---

## 1. RisuAI DOM 구조 (교차검증 완료)

### 1.1 이중 flex-col-reverse 구조
RisuAI 소스 (`DefaultChatScreen.svelte` L571, `Chats.svelte` L200) 확인 결과:

```
OUTER: <div class="flex flex-col-reverse ... default-chat-screen">  ← 스크롤 컨테이너
  ├── <div class="sticky/mt-2"> ← 입력 영역 (div #1)
  ├── (선택적) <div> ← 파일 프리뷰, 스티커 등
  ├── (선택적) <button> ← Load More
  ├── INNER: <div class="flex flex-col-reverse"> ← Chats 컴포넌트 (div #N)
  │     ├── <div class="chat-message-container" x-hashed="..."> ← 메시지 1 (최신)
  │     ├── <div class="chat-message-container" x-hashed="..."> ← 메시지 2
  │     └── ... (모든 자식이 .chat-message-container)
  ├── (선택적) <Chat firstMessage/> ← 첫 인사 메시지
  └── (선택적) AI 경고, 크리에이터 노트 등
</div>
```

### 1.2 핵심 사실
- **INNER 컨테이너**의 자식은 **오직 `.chat-message-container`만** 존재 (Chats.svelte L85)
- `flex-col-reverse`이므로 DOM child 1 = 최신 메시지 (시각적 하단), child N = 가장 오래된 메시지 (시각적 상단)
- 메시지는 `chatBody.prepend(b)` 또는 `chatBody.insertBefore(b, nextElement.nextSibling)`로 삽입됨

---

## 2. Chat Limiter 작동 방식

### 2.1 CSS 기반 숨김
```javascript
// 감지 셀렉터 (cpm-chat-limiter.js L47)
const CSS_SELECTORS = [
    '.flex-col-reverse > .chat-message-container',  // ← 주로 이것이 감지됨
    ...
];

// 생성되는 CSS (L104)
function generateCSS(selector, count) {
    return `${selector}:nth-child(n+${count + 1}) { display: none !important; }`;
}
// 결과 예시 (keepCount=6):
// .flex-col-reverse > .chat-message-container:nth-child(n+7) { display: none !important; }
```

### 2.2 인터-플러그인 API
```javascript
window._cpmLimiterState = {
    enabled,          // boolean
    keepCount,        // number (표시할 메시지 수)
    totalMessageCount,
    detectedSelector,
    isVisible: (index) => !enabled || index <= keepCount,
    getVisibleCount: () => enabled ? Math.min(keepCount, totalMessageCount) : totalMessageCount,
};
```

### 2.3 메시지 카운트 방식
```javascript
// L88-99: 부모 셀렉터를 추출하여 querySelectorAll로 카운트
const parts = detectedSelector.split('>').map(s => s.trim());
const parentSel = parts[0]; // '.flex-col-reverse'
const parent = await rootDoc.querySelector(parentSel);
// ⚠️ querySelector('.flex-col-reverse') → OUTER 컨테이너를 먼저 찾음
// 그러나 querySelectorAll('.flex-col-reverse > .chat-message-container')는
// 하위 요소까지 검색하므로 INNER의 메시지들을 올바르게 카운트함 ✓
```

---

## 3. Chat Navigation 작동 방식

### 3.1 컨테이너 탐색
```javascript
// cpm-chat-navigation.js L100-115
const selectors = [
    '.flex-col-reverse:nth-of-type(2)',   // ← 내부 컨테이너 타겟 시도
    '.flex-col-reverse:nth-of-type(1)',   // ← 폴백 (외부 컨테이너 매칭 위험!)
    'main .flex-col-reverse',             // ← 외부 먼저 매칭
    '.flex-col-reverse'                   // ← 외부 먼저 매칭
];
```

### 3.2 메시지 카운트 (Limiter 연동)
```javascript
// L124-136
const getMessageCount = async () => {
    const container = await rootDoc.querySelector(containerSelector);
    const children = await container.getChildren();
    const total = children ? children.length : 0;  // ← 숨겨진 것 포함 전체 DOM 자식 수
    const limiter = window._cpmLimiterState;
    if (limiter && limiter.enabled) {
        return Math.min(total, limiter.keepCount);  // ← keepCount로 클램핑
    }
    return total;
};
```

### 3.3 스크롤 함수
```javascript
// 위로 스크롤 (오래된 메시지 방향)
const scrollUp = async () => {
    const count = await getMessageCount();      // keepCount로 클램핑됨
    if (currentIndex < count) currentIndex++;   // ← currentIndex 증가
    const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
    const el = await rootDoc.querySelector(sel);
    if (el) await el.scrollIntoView(true);      // ← 이 요소가 display:none이면?
};
```

---

## 4. 발견된 버그

### 🔴 BUG-1: `currentIndex` 동기화 실패 (PRIMARY)

**시나리오:**
1. Limiter OFF, 100개 메시지, 사용자가 Navigation으로 메시지 50번으로 이동 → `currentIndex = 50`
2. 사용자가 Limiter 활성화, keepCount = 6
3. CSS로 child 7~100이 `display: none` 됨
4. **currentIndex는 여전히 50** (리셋되지 않음!)

**scrollUp 호출 시:**
```javascript
const count = 6;           // getMessageCount()
if (50 < 6) → false;      // currentIndex 변경 안 됨!
// *:nth-child(50) → display:none 요소 → scrollIntoView 실패
```

**scrollDown 호출 시:**
```javascript
if (50 > 1) currentIndex--; // 50 → 49
// *:nth-child(49) → display:none 요소 → scrollIntoView 실패
// 반복해서 49 → 48 → ... → 7 → 6 (여기서야 보이는 요소!)
// 44번 클릭해야 정상 복구!
```

**goToTop/goToBottom은 절대 위치라 정상 동작:**
```javascript
goToTop:    currentIndex = count(6)  → *:nth-child(6) → 보임 ✓
goToBottom: currentIndex = 1         → *:nth-child(1) → 보임 ✓
```

### 🟠 BUG-2: 컨테이너 셀렉터 불안정성

**문제:** `.flex-col-reverse:nth-of-type(2)` 셀렉터는 DOM 구조에 의존적
- `:nth-of-type(N)`은 CSS 클래스가 아닌 **태그 타입(div)** 기준으로 카운트
- INNER flex-col-reverse가 OUTER의 2번째 div 자식일 때만 정확히 매칭
- 파일 프리뷰, 스티커, 기타 선택적 div 요소가 렌더링되면 순서가 변경됨

**폴백 위험:**
- `nth-of-type(2)` 실패 시 → `nth-of-type(1)` 시도 → OUTER 컨테이너 매칭 가능
- OUTER의 `getChildren()`은 입력 영역, 버튼, Chats div 등 **비-메시지 요소를 포함**
- 이 경우 `*:nth-child(N)`이 완전히 잘못된 요소를 가리킴

### 🟡 BUG-3: 이벤트 동기화 부재

**문제:** Limiter keepCount 변경 시 Navigation에 즉시 알리는 메커니즘 없음
- Limiter: `keepCount` 변경 → CSS 즉시 업데이트 + `window._cpmLimiterState` 업데이트
- Navigation: `getMessageCount()`를 스크롤 함수 호출 시에만 읽음
- **커스텀 이벤트나 콜백 없음** → `currentIndex` 리셋 기회 없음

### 🟡 BUG-4: `scrollIntoView()` on `display:none`

**사실:** `display: none`인 요소에 대해 `scrollIntoView()`를 호출하면:
- 요소에 레이아웃 위치가 없으므로 스크롤이 발생하지 않음
- 에러는 발생하지 않지만 아무런 시각적 변화 없음 (사용자에게 "버튼이 안 먹힌다"로 인식)

---

## 5. 원인 요약

| 버그 | 심각도 | 원인 | 영향 |
|------|--------|------|------|
| BUG-1 | 🔴 HIGH | `currentIndex`가 keepCount 변경 시 클램핑/리셋 안 됨 | scrollUp/Down이 숨겨진 요소를 가리킴 |
| BUG-2 | 🟠 MED | `nth-of-type` 셀렉터가 DOM 변화에 취약 | 잘못된 컨테이너 타겟팅 |
| BUG-3 | 🟡 LOW | Limiter→Navigation 이벤트 알림 없음 | currentIndex 리셋 기회 없음 |
| BUG-4 | 🟡 LOW | display:none에 scrollIntoView | 조용한 실패 (UX 혼란) |

---

## 6. SafeElement API 교차검증 (v3.svelte.ts)

### 6.1 scrollIntoView — 네이티브 직접 패스스루
```typescript
// v3.svelte.ts L221-223
public scrollIntoView(options?: boolean | ScrollIntoViewOptions) {
    this.#element.scrollIntoView(options);
}
```
→ **확인**: `display:none` 요소에 호출 시 아무 동작 없음 (BUG-4 확정)

### 6.2 getChildren — 모든 DOM 자식 반환 (visibility 무관)
```typescript
// v3.svelte.ts L138-148
public getChildren(): SafeElement[] {
    const children: SafeElement[] = [];
    this.#element.childNodes.forEach(node => {
        if(node instanceof HTMLElement) {
            children.push(new SafeElement(node));
        }
    });
    return children;
}
```
→ **확인**: 숨겨진 요소도 포함하여 ALL HTMLElement 자식 반환 → Navigation의 `total` 변수에 숨겨진 메시지도 카운트됨

### 6.3 querySelector/querySelectorAll — 네이티브 직접 패스스루
```typescript
// v3.svelte.ts L186-203
public querySelector(selector: string): SafeElement | null {
    const element = this.#element.querySelector(selector);
    if(element instanceof HTMLElement) { return new SafeElement(element); }
    return null;
}
```
→ **확인**: CSS `nth-child` 셀렉터가 `display:none` 요소도 매칭함

### 6.4 getRootDocument — document.documentElement 래핑
```typescript
// v3.svelte.ts L780-787
getRootDocument: async () => {
    const conf = await getPluginPermission(plugin.name, 'mainDom');
    if(!conf) return null;
    return new SafeDocument(document);
    // SafeDocument extends SafeElement, wraps document.documentElement
}
```
→ **확인**: `rootDoc.querySelector()`는 전체 DOM 트리를 검색

### 6.5 RisuAI 자체 네비게이션 방식 (참고)
```typescript
// DefaultChatScreen.svelte L95-124
const element = document.querySelector(`[data-chat-index="${index}"]`);
element.scrollIntoView({behavior: "instant", block: "start"});
```
→ **참고**: RisuAI 자체는 `data-chat-index` 속성 기반 셀렉터를 사용 (`nth-child` 아님)
→ 각 메시지 `.risu-chat` 요소에 `data-chat-index="N"` 속성이 존재 (Chat.svelte L987-988)

---

## 7. 검증 결론

| 항목 | 검증 결과 | 출처 |
|------|----------|------|
| getChildren()가 숨겨진 요소 포함 | ✅ 확정 | v3.svelte.ts L138 |
| scrollIntoView가 display:none에 실패 | ✅ 확정 | 네이티브 DOM 사양 + v3.svelte.ts L221 |
| nth-child가 display:none 요소 카운트 | ✅ 확정 | CSS Selectors L4 사양 |
| INNER 컨테이너에 .chat-message-container만 존재 | ✅ 확정 | Chats.svelte L85 |
| 이중 flex-col-reverse 구조 | ✅ 확정 | DefaultChatScreen.svelte L571 + Chats.svelte L200 |
| Navigation이 data-chat-index 미사용 | ✅ 확인 | cpm-chat-navigation.js 전체 코드 검색 |

### 최종 판정
보고서의 모든 버그(BUG-1~4) RisuAI 오픈소스와 교차검증 완료. **BUG-1(currentIndex 동기화 실패)이 사용자 체감 문제의 직접적 원인**이며, BUG-2~4는 BUG-1 발생 시 증상을 악화시키는 보조 요인.
