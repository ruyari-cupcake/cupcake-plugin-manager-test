// ══════════════════════════════════════════════════════════
// Universal CORS Proxy — Cloudflare Workers
// ══════════════════════════════════════════════════════════
// NanoGPT, OpenAI, Anthropic, Copilot 등 모든 AI API에 사용 가능한
// 범용 CORS 프록시. Authorization 헤더를 그대로 대상 API에 전달합니다.
//
// ── 배포 방법 ──
//   1. Cloudflare Dashboard → Workers & Pages → Create Worker
//   2. 이 코드 전체를 붙여넣기 → Deploy
//   3. (선택) Settings → Variables에 ACCESS_TOKEN을 설정하면 접근 제한 가능
//
// ── CPM 플러그인에서 사용 ──
//   커스텀 모델 편집 → CORS Proxy URL에 워커 URL 입력
//   예: https://my-universal-proxy.username.workers.dev
//
// ── 지원 모드 ──
//   1. X-Target-URL 헤더 모드 (CPM 자동 전송)
//      요청의 X-Target-URL 헤더에 원래 대상 URL이 들어옴
//   2. URL-in-URL 모드 (수동 사용)
//      https://proxy.workers.dev/https://api.target.com/v1/chat/completions
//   3. Copilot 호환 모드 (/chat/completions, /v1/messages 등)
//      X-Copilot-Auth: <github_oauth_token> 헤더 있으면 자동 tid 교환
//
// ── 접근 제한 (선택) ──
//   Settings → Variables → ACCESS_TOKEN 환경변수 설정
//   요청 시 X-Proxy-Token: <token> 헤더 추가
// ══════════════════════════════════════════════════════════

// ── Copilot 호환 상수 (Copilot 모드 전용) ──
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const COPILOT_API_BASE = "https://api.githubcopilot.com";
const CHAT_VERSION = "0.26.2025030601";
const CODE_VERSION = "1.99.2025030601";
const USER_AGENT = `GitHubCopilotChat/${CHAT_VERSION}`;

const COPILOT_PATHS = new Set([
  "/chat/completions",
  "/v1/chat/completions",
  "/v1/messages",
  "/responses",
  "/v1/responses",
]);

// ── CORS 헤더 ──
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

// ── 전달 시 제외할 헤더 (hop-by-hop / 프록시 메타) ──
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "x-target-url",
  "x-proxy-token",
  "x-copilot-auth",
  "cf-connecting-ip",
  "cf-ray",
  "cf-visitor",
  "cf-ipcountry",
  "cf-warp-tag-id",
  "cdn-loop",
]);

function generateHexId(length = 64) {
  const arr = new Uint8Array(length / 2);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Copilot tid 토큰 발급 ──
async function refreshTidToken(apiKey) {
  const resp = await fetch(COPILOT_TOKEN_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": USER_AGENT,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`tid token failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  if (!data.token || !data.expires_at) {
    throw new Error("tid token response missing token or expires_at");
  }

  return data.token;
}

// ── Copilot 경로 정규화 ──
function normalizeCopilotPath(pathname) {
  if (pathname === "/v1/chat/completions") return "/chat/completions";
  if (pathname === "/v1/responses") return "/responses";
  return pathname;
}

// ── 대상 URL 결정 ──
function resolveTargetUrl(request, url) {
  // 1순위: X-Target-URL 헤더 (CPM Direct/Rewrite 모드 모두 전송)
  const xTargetUrl = request.headers.get("X-Target-URL");
  if (xTargetUrl) {
    return { targetUrl: xTargetUrl, mode: "header" };
  }

  // 2순위: URL-in-URL — /https://target.com/path 형태
  if (/^\/https?:\/\//i.test(url.pathname)) {
    const targetUrl = url.pathname.slice(1) + url.search;
    return { targetUrl, mode: "url-in-url" };
  }

  // 3순위: Copilot 호환 모드 — X-Copilot-Auth 헤더가 있으면 Copilot API로 라우팅
  const copilotAuth = request.headers.get("X-Copilot-Auth");
  if (copilotAuth && COPILOT_PATHS.has(url.pathname)) {
    return { targetUrl: null, mode: "copilot", copilotAuth };
  }

  return { targetUrl: null, mode: null };
}

// ── JSON 에러 응답 ──
function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ── 메인 핸들러 ──
export default {
  async fetch(request, env) {
    // ── CORS preflight ──
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── Health check ──
    if ((url.pathname === "/" || url.pathname === "/health") && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "ok",
          type: "universal-cors-proxy",
          modes: [
            "X-Target-URL header (recommended — CPM auto-sends)",
            "URL-in-URL: /https://api.example.com/v1/chat/completions",
            "Copilot compat: X-Copilot-Auth header + standard paths",
          ],
        }),
        {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // ── 접근 제한 (ACCESS_TOKEN 환경변수 설정 시) ──
    const accessToken = env?.ACCESS_TOKEN;
    if (accessToken) {
      const proxyToken = request.headers.get("X-Proxy-Token") || "";
      if (proxyToken !== accessToken) {
        return jsonError("Proxy access denied. Set X-Proxy-Token header.", 403);
      }
    }

    // ── 대상 URL 결정 ──
    const resolved = resolveTargetUrl(request, url);

    // ═══════════════════════════════════════════════════
    // 모드 A: 범용 프록시 (header / url-in-url)
    // ═══════════════════════════════════════════════════
    if (resolved.mode === "header" || resolved.mode === "url-in-url") {
      return await handleGenericProxy(request, resolved.targetUrl, resolved.mode);
    }

    // ═══════════════════════════════════════════════════
    // 모드 B: Copilot 호환 (기존 Copilot 프록시와 동일)
    // ═══════════════════════════════════════════════════
    if (resolved.mode === "copilot") {
      return await handleCopilotProxy(request, url, resolved.copilotAuth);
    }

    // ── 알 수 없는 요청 ──
    return jsonError(
      "Target URL required. CPM 플러그인에서 proxyUrl을 설정하면 X-Target-URL 헤더가 자동 전송됩니다. " +
        "또는 URL-in-URL 형식: /https://api.target.com/v1/chat/completions",
      400
    );
  },
};

// ══════════════════════════════════════════════════════════
// 범용 프록시 핸들러
// ══════════════════════════════════════════════════════════
async function handleGenericProxy(request, targetUrl, mode) {
  // URL 유효성 검사
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return jsonError(`Invalid target URL: ${targetUrl}`, 400);
  }

  // 보안: private/loopback IP 차단 (SSRF 방지)
  const hostname = parsedTarget.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname)
  ) {
    return jsonError("Proxy to private/loopback addresses is not allowed.", 403);
  }

  // 요청 헤더 복사 (메타 헤더 제외)
  const forwardHeaders = new Headers();
  for (const [key, value] of request.headers) {
    if (STRIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    forwardHeaders.set(key, value);
  }

  try {
    const fetchOptions = {
      method: request.method,
      headers: forwardHeaders,
    };

    // GET/HEAD는 body 없음
    if (request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = request.body;
    }

    const response = await fetch(targetUrl, fetchOptions);

    // 응답 헤더에 CORS 추가
    const responseHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(k, v);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return jsonError(`Proxy fetch failed: ${err.message}`, 502);
  }
}

// ══════════════════════════════════════════════════════════
// Copilot 호환 프록시 핸들러
// ══════════════════════════════════════════════════════════
async function handleCopilotProxy(request, url, copilotAuth) {
  if (request.method !== "POST") {
    return jsonError("Method Not Allowed", 405);
  }

  // Authorization 헤더도 확인 (X-Copilot-Auth가 없으면)
  const apiKey =
    copilotAuth ||
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-api-key") ||
    "";

  if (!apiKey) {
    return jsonError(
      "Copilot mode requires X-Copilot-Auth header or Authorization: Bearer <github_oauth_token>",
      401
    );
  }

  let tidToken;
  try {
    tidToken = await refreshTidToken(apiKey);
  } catch (e) {
    return jsonError(e.message, 401);
  }

  const rawBody = await request.text();
  const isStream =
    rawBody.includes('"stream":true') || rawBody.includes('"stream": true');

  const sessionId = crypto.randomUUID() + Date.now().toString();
  const targetPath = normalizeCopilotPath(url.pathname);
  const copilotUrl = `${COPILOT_API_BASE}${targetPath}`;

  const copilotHeaders = {
    Authorization: `Bearer ${tidToken}`,
    "Content-Type": "application/json",
    "Copilot-Integration-Id": "vscode-chat",
    "Editor-plugin-version": `copilot-chat/${CHAT_VERSION}`,
    "Editor-version": `vscode/${CODE_VERSION}`,
    "User-Agent": USER_AGENT,
    "Vscode-Machineid": generateHexId(64),
    "Vscode-Sessionid": sessionId,
    "X-Github-Api-Version": "2025-10-01",
    "X-Initiator": "user",
    "X-Interaction-Id": crypto.randomUUID(),
    "X-Interaction-Type": "conversation-panel",
    "X-Request-Id": crypto.randomUUID(),
    "X-Vscode-User-Agent-Library-Version": "electron-fetch",
  };

  if (targetPath === "/v1/messages") {
    copilotHeaders["anthropic-version"] =
      request.headers.get("anthropic-version") || "2023-06-01";
  }

  try {
    const response = await fetch(copilotUrl, {
      method: "POST",
      headers: copilotHeaders,
      body: rawBody,
    });

    const responseHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(k, v);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return jsonError(`Copilot proxy fetch failed: ${err.message}`, 502);
  }
}
