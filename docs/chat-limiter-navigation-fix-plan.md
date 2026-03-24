# Chat Limiter × Chat Navigation 수정 계획서

## 수정 대상
- `cpm-chat-navigation.js` (v2.1.5 → v2.1.6)
- `cpm-chat-limiter.js` (v0.2.1 → v0.2.2)

---

## FIX-1: currentIndex 클램핑 (BUG-1 해결 — PRIMARY)

### 문제
`currentIndex`가 Limiter의 `keepCount` 변경에 반응하지 않아 숨겨진 요소를 가리킴

### 수정 위치: `cpm-chat-navigation.js`

#### 1a. `scrollUp` 함수에 클램핑 추가 (L170)
```javascript
// BEFORE:
const scrollUp = async () => {
    if (!isReady) return;
    try {
        const count = await getMessageCount();
        if (currentIndex < count) currentIndex++;
        const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
        ...

// AFTER:
const scrollUp = async () => {
    if (!isReady) return;
    try {
        const count = await getMessageCount();
        if (count === 0) return;
        // 🔧 FIX-1: keepCount가 줄어들었을 때 currentIndex를 가시 범위로 클램핑
        if (currentIndex > count) currentIndex = count;
        if (currentIndex < count) currentIndex++;
        const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
        ...
```

#### 1b. `scrollDown` 함수에 클램핑 추가 (L178)
```javascript
// BEFORE:
const scrollDown = async () => {
    if (!isReady) return;
    try {
        if (currentIndex > 1) currentIndex--;
        const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
        ...

// AFTER:
const scrollDown = async () => {
    if (!isReady) return;
    try {
        const count = await getMessageCount();
        if (count === 0) return;
        // 🔧 FIX-1: 먼저 가시 범위로 클램핑한 뒤 감소
        if (currentIndex > count) currentIndex = count;
        if (currentIndex > 1) currentIndex--;
        const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
        ...
```

### 검증 시나리오:
1. Limiter OFF → navigate to msg 50 → Limiter ON (keepCount=6) → scrollUp → currentIndex: 50→6→6 (이미 max) → nth-child(6) = VISIBLE ✅
2. 같은 상황에서 scrollDown → currentIndex: 50→6→5 → nth-child(5) = VISIBLE ✅
3. Limiter ON (keepCount=20) → navigate to 15 → keepCount→6 → scrollUp → 15→6→6 ✅
4. 같은 상황에서 scrollDown → 15→6→5 ✅

---

## FIX-2: 컨테이너 셀렉터 개선 (BUG-2 해결)

### 문제
`nth-of-type` 셀렉터가 DOM 변화에 취약하여 OUTER 컨테이너를 타겟팅할 위험

### 수정 위치: `cpm-chat-navigation.js`

#### 2a. 셀렉터 우선순위 변경 (L100)
```javascript
// BEFORE:
const selectors = [
    '.flex-col-reverse:nth-of-type(2)',
    '.flex-col-reverse:nth-of-type(1)',
    'main .flex-col-reverse',
    '.flex-col-reverse'
];

// AFTER:
const selectors = [
    // INNER 컨테이너를 직접 타겟: .chat-message-container를 자식으로 가진 flex-col-reverse
    '.flex-col-reverse:has(> .chat-message-container)',
    // 기존 폴백
    '.flex-col-reverse:nth-of-type(2)',
    '.flex-col-reverse:nth-of-type(1)',
    'main .flex-col-reverse',
    '.flex-col-reverse'
];
```

#### 2b. 컨테이너 검증 로직 강화
```javascript
// BEFORE:
if (children && children.length >= 2) {
    containerSelector = sel;
    return true;
}

// AFTER:
if (children && children.length >= 2) {
    // 추가 검증: 첫 번째 자식이 .chat-message-container인지 확인
    try {
        const firstChild = await rootDoc.querySelector(`${sel} > .chat-message-container`);
        if (firstChild) {
            containerSelector = sel;
            return true;
        }
    } catch (_) {}
    // .chat-message-container가 없으면 다음 셀렉터 시도 (OUTER일 수 있음)
}
```

### 검증:
- `:has()` 셀렉터는 CSS Selectors L4 사양으로 모든 모던 브라우저 지원
- RisuAI 최소 요구 버전(Chrome 105+)에서 `:has()` 지원 확인

---

## FIX-3: Limiter 상태 변경 이벤트 추가 (BUG-3 해결)

### 문제
Limiter keepCount 변경 시 Navigation이 즉시 반응하지 못함

### 수정 위치: `cpm-chat-limiter.js`

#### 3a. 상태 변경 시 이벤트 디스패치 (updatePublicState 수정)
```javascript
// BEFORE (cpm-chat-limiter.js ~L57):
function updatePublicState() {
    window._cpmLimiterState = {
        enabled,
        keepCount,
        totalMessageCount,
        detectedSelector,
        isVisible: (index) => !enabled || index <= keepCount,
        getVisibleCount: () => enabled ? Math.min(keepCount, totalMessageCount) : totalMessageCount,
    };
}

// AFTER:
function updatePublicState() {
    window._cpmLimiterState = {
        enabled,
        keepCount,
        totalMessageCount,
        detectedSelector,
        isVisible: (index) => !enabled || index <= keepCount,
        getVisibleCount: () => enabled ? Math.min(keepCount, totalMessageCount) : totalMessageCount,
    };
    // 🔧 FIX-3: Navigation 등 다른 플러그인에 상태 변경 알림
    try {
        window.dispatchEvent(new CustomEvent('cpm-limiter-change', {
            detail: { enabled, keepCount, totalMessageCount }
        }));
    } catch (_) {}
}
```

### 수정 위치: `cpm-chat-navigation.js`

#### 3b. 이벤트 리스너로 currentIndex 즉시 클램핑
```javascript
// 추가 (init 영역에):
const onLimiterChange = (e) => {
    const { enabled: limEnabled, keepCount: limKeep } = e.detail;
    if (limEnabled && currentIndex > limKeep) {
        currentIndex = Math.max(1, limKeep);
    }
};
window.addEventListener('cpm-limiter-change', onLimiterChange);

// cleanup에 추가:
window.removeEventListener('cpm-limiter-change', onLimiterChange);
```

---

## 변경 요약

| 파일 | 변경 | 버전 |
|------|------|------|
| cpm-chat-navigation.js | FIX-1 (클램핑), FIX-2 (셀렉터), FIX-3b (이벤트 리스너) | v2.1.5 → v2.1.6 |
| cpm-chat-limiter.js | FIX-3a (이벤트 디스패치) | v0.2.1 → v0.2.2 |

### 수정 우선순위
1. **FIX-1** (필수) — 즉시 사용자 체감 개선
2. **FIX-3** (권장) — 실시간 동기화로 UX 향상
3. **FIX-2** (방어적) — 엣지 케이스 방지

### 위험도 평가
- FIX-1: 🟢 LOW — 기존 로직에 클램핑 1줄 추가, 부작용 없음
- FIX-2: 🟡 LOW-MED — `:has()` 셀렉터 의존 (모던 브라우저 필수), 폴백 유지
- FIX-3: 🟢 LOW — CustomEvent는 표준 API, 리스너 없으면 무시됨
