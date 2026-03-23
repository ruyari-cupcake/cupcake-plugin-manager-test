# Chat Limiter 작업계획서

## 개요

RisuAI 채팅 화면에서 최신 N개 메시지만 표시하여 렌더링 렉을 제거하는 CPM 서브플러그인.
chat-view-fold-v3_2.0.5 에서 핵심 기능만 추출하여 경량화.

---

## 형태: CPM 서브플러그인 (`cpm-chat-limiter.js`)

### 이유
- DOM 조작 API 완전 제공 (getRootDocument, createElement, 등)
- CPM 설정 패널에 통합 가능 (CupcakePM_SubPlugins 등록)
- 자동 업데이트 지원 (@update-url)
- 기존 서브플러그인(Resizer, Navigation)과 동일한 패턴

---

## 구현 상세

### 파일 구조
```
cpm-chat-limiter.js   ← 단일 파일 서브플러그인
```

### 핵심 코드 (약 ~80줄)

#### Step 1: 헤더 + 초기화
```javascript
//@name CPM Component - Chat Limiter
//@display-name 🧁 Cupcake Chat Limiter
//@version 0.1.0
//@description 최신 N개 채팅만 표시하여 렉 제거
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/.../cpm-chat-limiter.js

(async () => {
    // 핫 리로드 클린업
    if (typeof window._cpmLimiterCleanup === 'function') {
        try { await window._cpmLimiterCleanup(); } catch (_) {}
    }

    const risuai = window.risuai || window.Risuai;
    if (!risuai) return;
    // ...
})();
```

#### Step 2: CSS 선택자 탐지
```javascript
const CSS_SELECTORS = [
    '.flex-col-reverse > .chat-message-container',
    '.chat-message-list > .chat-message-container',
    '[class*="chat"] > [class*="message"]',
    '.message-container'
];

async function detectSelector(doc) {
    for (const sel of CSS_SELECTORS) {
        const el = await doc.querySelector(sel);
        if (el) return sel;
    }
    return null;
}
```

#### Step 3: CSS 주입
```javascript
function generateCSS(selector, keepCount) {
    return `${selector}:nth-child(n+${keepCount + 1}) { display: none !important; }`;
}

async function updateStyles(doc, selector, keepCount, enabled) {
    const STYLE_ID = 'x-cpm-limiter-style';
    let styleEl = await doc.querySelector(`[${STYLE_ID}]`);
    if (!styleEl) {
        styleEl = await doc.createElement('style');
        await styleEl.setAttribute(STYLE_ID, '');
        const head = await doc.querySelector('head');
        await head.appendChild(styleEl);
    }
    const css = enabled ? generateCSS(selector, keepCount) : '';
    await styleEl.setInnerHTML(css);
}
```

#### Step 4: CPM 설정 패널 통합
```javascript
window.CupcakePM_SubPlugins.push({
    id: 'cpm-chat-limiter',
    name: 'Chat Limiter',
    description: '최신 N개 채팅만 표시하여 렉을 제거합니다.',
    version: '0.1.0',
    icon: '📋',
    uiHtml: `
        <div class="mb-2">
            <label class="flex items-center space-x-2 text-sm text-gray-300">
                <input id="cpm_chat_limiter_enable" type="checkbox" ...>
                <span>Chat Limiter 활성화</span>
            </label>
        </div>
        <div class="mb-2">
            <label class="text-sm text-gray-300">표시할 메시지 수</label>
            <input id="cpm_chat_limiter_count" type="number" min="1" max="100" value="6" ...>
        </div>
    `,
    onRender: () => { /* 설정값 읽어서 UI 반영 */ },
    onCleanup: () => { /* 스타일 제거 */ }
});
```

#### Step 5: 클린업
```javascript
window._cpmLimiterCleanup = async () => {
    // <style> 태그 내용 비우기
    // 이벤트 리스너 제거
    // 서브플러그인 등록 해제
};
risuai.onUnload(window._cpmLimiterCleanup);
```

---

## 설정 (@arg)

| 키 | 타입 | 기본값 | 설명 |
|----|------|--------|------|
| `cpm_chat_limiter_enable` | checkbox | true | 기능 ON/OFF |
| `cpm_chat_limiter_count` | number | 6 | 표시할 최대 메시지 수 |

---

## chat-view-fold 대비 제거 항목

| 기능 | chat-view-fold | chat-limiter |
|------|---------------|--------------|
| CSS 메시지 제한 | ✅ | ✅ |
| 접기/펼치기 버튼 | ✅ | ❌ |
| 키보드 단축키 | ✅ | ❌ |
| 자동 스크롤 | ✅ | ❌ |
| 점선 구분선 | ✅ | ❌ |
| 첫 메시지 숨기기 | ✅ | ❌ |
| CPM 설정 통합 | ❌ | ✅ |
| 자동 업데이트 | ❌ | ✅ |

---

## 릴리스 통합

1. `cpm-chat-limiter.js` 작성
2. `versions.json`에 엔트리 추가
3. `release.cjs` 실행 → update-bundle.json + release-hashes.json 갱신
4. test2에 배포하여 검증

---

## 검증 기준

- [ ] CSS 선택자가 RisuAI DOM에 정상 매칭
- [ ] keepCount 변경 시 실시간 반영
- [ ] ON/OFF 토글 시 즉시 적용/해제
- [ ] 핫 리로드 시 중복 <style> 태그 없음
- [ ] CPM 설정 패널에 정상 표시
- [ ] 다른 서브플러그인과 충돌 없음

---

## 예상 코드량

| 구간 | 줄 수 |
|------|-------|
| 헤더 + 초기화 | ~15 |
| CSS 선택자 탐지 | ~15 |
| CSS 생성 + 주입 | ~20 |
| CPM 설정 통합 | ~25 |
| 클린업 | ~10 |
| **합계** | **~85줄** |

원본 chat-view-fold: ~450줄 → **81% 감소**
