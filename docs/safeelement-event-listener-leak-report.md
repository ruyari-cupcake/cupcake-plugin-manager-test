# SafeElement Event Listener 참조 불일치 버그 보고서

## 개요
- **발견 경위**: 네비게이션 키보드 모드(3번째 모드) 사용 후 OFF로 전환해도 키보드 리스너가 계속 작동하는 증상 보고
- **근본 원인**: RisuAI SafeElement API의 `#eventIdMap`이 인스턴스별 프라이빗 필드이므로, `querySelector()`로 새로 얻은 참조에서 `removeEventListener()`를 호출하면 UUID 조회 실패
- **심각도**: 🔴 CRITICAL — 이벤트 리스너 누수, 모든 서브 플러그인에 잠재적 영향

---

## 1. RisuAI SafeElement API 동작 원리 (교차검증 완료)

### 1.1 addEventListener (v3.svelte.ts)
```typescript
#eventIdMap = new Map<string, Function>() // ← 인스턴스별 프라이빗 맵

public async addEventListener(type, listener, options): Promise<string> {
    const id = v4();  // UUID 생성
    const modifiedListener = (event) => { listener(trimEvent(event)); };
    this.#eventIdMap.set(id, modifiedListener);  // ← 이 인스턴스의 맵에만 저장
    document.addEventListener(type, modifiedListener, realOptions);
    return id;  // UUID 반환
}
```

### 1.2 removeEventListener (v3.svelte.ts)
```typescript
public removeEventListener(type, id, options) {
    const listener = this.#eventIdMap.get(id);  // ← 이 인스턴스의 맵에서만 검색
    if (listener) {
        document.removeEventListener(type, listener, realOptions);
        this.#eventIdMap.delete(id);
    }
    // listener가 없으면 → 아무 동작 없이 SILENT RETURN
}
```

### 1.3 핵심 문제
```
querySelector('body') [호출 1] → SafeElement 인스턴스 A (eventIdMap: {uuid → handler})
querySelector('body') [호출 2] → SafeElement 인스턴스 B (eventIdMap: {} ← EMPTY!)

인스턴스 B.removeEventListener('keydown', uuid) → eventIdMap에 uuid 없음 → 무시
→ document에는 실제 리스너가 그대로 남아있음!
```

---

## 2. 영향받는 파일 및 버그 목록

### 🔴 BUG-A: cpm-chat-navigation.js — 키보드 리스너 누수 (사용자 보고 증상)

**시나리오:**
1. 사용자가 네비게이션 버튼 3회 → 'keyboard' 모드 활성화
2. `enableKeyboard()` → `body1 = querySelector('body')` → `keyListenerId = body1.addEventListener('keydown', ...)`
3. 사용자가 네비게이션 버튼 1회 더 → 'off' 모드
4. `cycleMode()` → `disableKeyboard()` → `body2 = querySelector('body')` (새 인스턴스!)
5. `body2.removeEventListener('keydown', keyListenerId)` → body2의 eventIdMap에 없음 → **실패!**
6. `keyListenerId = null` (코드는 해제 완료로 착각)
7. **화살표 키가 여전히 작동** → 사용자 혼란

**코드 위치:**
```javascript
// enableKeyboard (L226-248)
const body = await rootDoc.querySelector('body');  // ← 인스턴스 A
keyListenerId = await body.addEventListener('keydown', ...);

// disableKeyboard (L254-260)
const body = await rootDoc.querySelector('body');  // ← 인스턴스 B (다름!)
if (body) await body.removeEventListener('keydown', keyListenerId); // FAILS!
```

### 🟠 BUG-B: cpm-chat-navigation.js — destroyWidget 드래그 리스너 누수

**코드 위치:**
```javascript
// createWidget 내부 (~L270)
const body = await rootDoc.querySelector('body');  // ← 인스턴스 A
globalPointerMoveId = await body.addEventListener('pointermove', onDragMove);
globalPointerUpId = await body.addEventListener('pointerup', onDragEnd);

// destroyWidget (L210-220)
const body = await rootDoc.querySelector('body');  // ← 인스턴스 B (다름!)
await body.removeEventListener('pointermove', globalPointerMoveId); // FAILS!
await body.removeEventListener('pointerup', globalPointerUpId);     // FAILS!
```

**완화 요소:** `onDragEnd` 콜백 내부에서는 클로저로 인스턴스 A를 참조하므로 정상 작동. 드래그 중이 아닌 상태에서는 이 리스너가 활성화되지 않으므로 실질적 영향은 제한적.

### 🟠 BUG-C: cpm-chat-resizer.js — 핫 리로드 시 pointerdown 누수

**코드 위치:**
```javascript
// initResizer (~L430)
const body = await rootDoc.querySelector('body');  // ← 인스턴스 A
window._cpmResizerPointerListenerId = await body.addEventListener('pointerdown', handlePointerDown);

// _cpmResizerCleanup (~L447)
const body = await rootDoc.querySelector('body');  // ← 인스턴스 B (다름!)
await body.removeEventListener('pointerdown', window._cpmResizerPointerListenerId); // FAILS!
```

**참고:** L431의 재등록 전 정리도 같은 `body` 스코프이므로 재등록 시에는 문제없음. 핫 리로드 시에만 누수.

---

## 3. 안전한 패턴 확인

| 패턴 | 상태 | 이유 |
|------|------|------|
| `window.addEventListener/removeEventListener` | ✅ 안전 | window 객체는 항상 동일 참조 |
| `document.addEventListener/removeEventListener` | ✅ 안전 | 플러그인 iframe의 document 직접 접근 |
| 클로저 내 동일 body 변수 | ✅ 안전 | 같은 SafeElement 인스턴스 |
| CPM Settings UI (checkbox 등) | ✅ 안전 | 표준 DOM 요소, SafeElement 아님 |
| `cpm-chat-limiter.js` | ✅ 안전 | removeEventListener 없음 |
| `cpm-copilot-manager.js` | ✅ 안전 | 표준 DOM API만 사용 |
| `cpm-translation-cache.js` | ✅ 안전 | document 직접 사용 |

---

## 4. 수정 방안

**원칙:** addEventListener 호출 시 사용한 SafeElement 참조를 보존하여 removeEventListener 시 동일 참조 사용

### FIX-A: 키보드 리스너 (cpm-chat-navigation.js)
```javascript
let keyListenerBody = null;  // 추가: body 참조 보존

const enableKeyboard = async () => {
    if (keyListenerId) return;
    const body = await rootDoc.querySelector('body');
    if (!body) return;
    keyListenerBody = body;  // 참조 보존
    keyListenerId = await body.addEventListener('keydown', handler);
};

const disableKeyboard = async () => {
    if (!keyListenerId) return;
    if (keyListenerBody) {
        await keyListenerBody.removeEventListener('keydown', keyListenerId);
    }
    keyListenerId = null;
    keyListenerBody = null;
};
```

### FIX-B: 위젯 드래그 리스너 (cpm-chat-navigation.js)
```javascript
let widgetBodyRef = null;  // 추가: createWidget에서 사용한 body 보존

const createWidget = async (mode) => {
    const body = await rootDoc.querySelector('body');
    widgetBodyRef = body;  // 참조 보존
    // ... 나머지 동일 ...
};

const destroyWidget = async () => {
    // widgetBodyRef 사용 (querySelector 재호출 하지 않음)
    if (widgetBodyRef && globalPointerMoveId) {
        await widgetBodyRef.removeEventListener('pointermove', globalPointerMoveId);
    }
    // ...
};
```

### FIX-C: pointerdown (cpm-chat-resizer.js)
```javascript
let _resizerBodyRef = null;

// initResizer에서:
_resizerBodyRef = await rootDoc.querySelector('body');
// ... 이 _resizerBodyRef로 addEventListener ...

// _cpmResizerCleanup에서:
if (_resizerBodyRef && window._cpmResizerPointerListenerId) {
    await _resizerBodyRef.removeEventListener('pointerdown', window._cpmResizerPointerListenerId);
}
```

---

## 5. 교차검증 결과

| 항목 | 검증 결과 | 출처 |
|------|----------|------|
| `#eventIdMap`이 인스턴스별 | ✅ 확정 | v3.svelte.ts — private class field |
| querySelector가 매번 새 인스턴스 반환 | ✅ 확정 | factory.ts serialize → 새 REMOTE_REF |
| removeEventListener가 조용히 실패 | ✅ 확정 | v3.svelte.ts — if(listener) guard |
| keydown이 allowedDelayedEventListeners | ✅ 확정 | v3.svelte.ts — 랜덤 지연 포함 |
| document에 직접 등록/해제 | ✅ 확정 | v3.svelte.ts — document.addEventListener 직접 호출 |
