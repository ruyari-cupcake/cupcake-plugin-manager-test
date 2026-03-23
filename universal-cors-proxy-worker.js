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
const CHAT_VERSION = "0.40.2026031401";
const CODE_VERSION = "1.111.0";
const CHROME_VERSION = "142.0.7444.265";
const ELECTRON_VERSION = "39.3.0";
const USER_AGENT = `GitHubCopilotChat/${CHAT_VERSION}`;
// Token exchange 용 브라우저 UA (CPM과 동일 — 최신 모델 접근 권한 확보에 필수)
const TOKEN_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/${CODE_VERSION} Chrome/${CHROME_VERSION} Electron/${ELECTRON_VERSION} Safari/537.36`;
// Token exchange API version (CPM copilot-headers.js GITHUB_TOKEN_API_VERSION과 동일)
const GITHUB_TOKEN_API_VERSION = "2024-12-15";

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
      "User-Agent": TOKEN_USER_AGENT,
      "Editor-Version": `vscode/${CODE_VERSION}`,
      "Editor-Plugin-Version": `copilot-chat/${CHAT_VERSION}`,
      "X-GitHub-Api-Version": GITHUB_TOKEN_API_VERSION,
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
    // Copilot 도메인 + X-Copilot-Auth → Copilot 핸들러로 라우팅 (tid 토큰 교환 필요)
    const copilotAuth = request.headers.get("X-Copilot-Auth");
    if (copilotAuth) {
      try {
        const targetHost = new URL(xTargetUrl).hostname.toLowerCase();
        if (targetHost.includes("githubcopilot.com")) {
          const targetPath = new URL(xTargetUrl).pathname;
          return { targetUrl: xTargetUrl, mode: "copilot", copilotAuth, copilotPath: targetPath };
        }
      } catch { /* invalid URL — fall through to generic */ }
    }
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
      return await handleCopilotProxy(request, url, resolved.copilotAuth, resolved.copilotPath);
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
// 비스트리밍 요청도 Copilot에는 stream:true로 보내서 CF 524 타임아웃 방지.
// 클라이언트가 비스트리밍이면 SSE를 읽어 JSON으로 재조립해서 반환.
// ══════════════════════════════════════════════════════════
async function handleCopilotProxy(request, url, copilotAuth, overridePath) {
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
  const clientWantsStream =
    rawBody.includes('"stream":true') || rawBody.includes('"stream": true');

  const sessionId = crypto.randomUUID() + Date.now().toString();
  const targetPath = normalizeCopilotPath(overridePath || url.pathname);
  const copilotUrl = `${COPILOT_API_BASE}${targetPath}`;

  // ── 비스트리밍 요청도 Copilot에는 stream:true 강제 주입 ──
  // CF Workers는 subrequest 응답 헤더 도착까지 ~30s 제한.
  // 비스트리밍이면 Copilot이 전체 생성 후에야 첫 바이트를 보내므로
  // 대형 모델(Claude Opus 등)에서 524 발생. 스트리밍이면 첫 이벤트가 빠르게 도착.
  let bodyForCopilot = rawBody;
  const forceStream = !clientWantsStream;
  if (forceStream) {
    try {
      const parsed = JSON.parse(rawBody);
      parsed.stream = true;
      bodyForCopilot = JSON.stringify(parsed);
    } catch {
      // JSON 파싱 실패 시 원본 그대로 전송
    }
  }

  const copilotHeaders = {
    Authorization: `Bearer ${tidToken}`,
    Accept: 'text/event-stream',
    "Content-Type": "application/json",
    "Copilot-Integration-Id": "vscode-chat",
    "Editor-Plugin-Version": `copilot-chat/${CHAT_VERSION}`,
    "Editor-Version": `vscode/${CODE_VERSION}`,
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
      body: bodyForCopilot,
    });

    // ── 에러 응답은 그대로 반환 ──
    if (!response.ok) {
      const responseHeaders = new Headers(response.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(k, v);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // ── 클라이언트가 스트리밍 원함 → 그대로 파이프 ──
    if (clientWantsStream) {
      const responseHeaders = new Headers(response.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(k, v);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // ── 클라이언트가 비스트리밍 → SSE 읽어서 JSON 재조립 ──
    const contentType = (response.headers.get("content-type") || "").toLowerCase();

    // Copilot이 stream:true를 무시하고 JSON을 돌려줄 수도 있음
    if (contentType.includes("application/json")) {
      const responseHeaders = new Headers(response.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(k, v);
      }
      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // SSE 재조립: 포맷별 분기 (Anthropic /v1/messages vs OpenAI /chat/completions)
    const isAnthropic = targetPath === "/v1/messages";
    const assembled = isAnthropic
      ? await reassembleAnthropicSSE(response)
      : await reassembleOpenAISSE(response);

    return new Response(JSON.stringify(assembled), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return jsonError(`Copilot proxy fetch failed: ${err.message}`, 502);
  }
}

// ══════════════════════════════════════════════════════════
// Anthropic SSE → 비스트리밍 JSON 재조립
// ══════════════════════════════════════════════════════════
async function reassembleAnthropicSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let message = null;
  const contentBlocks = [];
  const blockTexts = {};
  let stopReason = null;
  let outputUsage = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]" || !data) continue;
      try {
        const ev = JSON.parse(data);
        switch (ev.type) {
          case "message_start":
            message = ev.message;
            break;
          case "content_block_start":
            contentBlocks[ev.index] = ev.content_block;
            blockTexts[ev.index] = "";
            break;
          case "content_block_delta":
            if (ev.delta?.type === "text_delta") {
              blockTexts[ev.index] = (blockTexts[ev.index] || "") + (ev.delta.text || "");
            } else if (ev.delta?.type === "thinking_delta") {
              blockTexts[ev.index] = (blockTexts[ev.index] || "") + (ev.delta.thinking || "");
            } else if (ev.delta?.type === "signature_delta") {
              // signature는 content_block에 직접 설정
              if (contentBlocks[ev.index]) contentBlocks[ev.index].signature = ev.delta.signature;
            }
            break;
          case "message_delta":
            if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
            if (ev.usage) outputUsage = ev.usage;
            break;
        }
      } catch { /* ignore malformed JSON */ }
    }
  }

  if (!message) return { error: "No message_start event received from Copilot" };

  // content 재조립
  message.content = contentBlocks.map((block, i) => {
    const text = blockTexts[i] || "";
    if (block.type === "thinking") return { ...block, thinking: text };
    if (block.type === "text") return { ...block, text };
    return block;
  });
  if (stopReason) message.stop_reason = stopReason;
  if (outputUsage && Object.keys(outputUsage).length > 0) {
    message.usage = { ...(message.usage || {}), ...outputUsage };
  }
  // stream 필드 제거 (클라이언트는 비스트리밍 기대)
  delete message.stream;

  return message;
}

// ══════════════════════════════════════════════════════════
// OpenAI SSE → 비스트리밍 JSON 재조립
// ══════════════════════════════════════════════════════════
async function reassembleOpenAISSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  const choiceContents = {}; // index → accumulated content
  const choiceReasoningContents = {}; // index → accumulated reasoning
  let finishReason = null;
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]" || !data) continue;
      try {
        const ev = JSON.parse(data);
        if (!result) {
          result = {
            id: ev.id || "",
            object: "chat.completion",
            created: ev.created || Math.floor(Date.now() / 1000),
            model: ev.model || "",
            choices: [],
          };
        }
        if (ev.usage) usage = ev.usage;
        if (ev.choices) {
          for (const choice of ev.choices) {
            const idx = choice.index || 0;
            if (choice.delta?.content) {
              choiceContents[idx] = (choiceContents[idx] || "") + choice.delta.content;
            }
            if (choice.delta?.reasoning_content) {
              choiceReasoningContents[idx] = (choiceReasoningContents[idx] || "") + choice.delta.reasoning_content;
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
          }
        }
      } catch { /* ignore */ }
    }
  }

  if (!result) return { error: "No SSE events received from Copilot" };

  // choices 재조립
  const indices = new Set([
    ...Object.keys(choiceContents).map(Number),
    ...Object.keys(choiceReasoningContents).map(Number),
  ]);
  if (indices.size === 0) indices.add(0);

  result.choices = [...indices].sort().map((idx) => ({
    index: idx,
    message: {
      role: "assistant",
      content: choiceContents[idx] || "",
      ...(choiceReasoningContents[idx] ? { reasoning_content: choiceReasoningContents[idx] } : {}),
    },
    finish_reason: finishReason || "stop",
  }));
  if (usage) result.usage = usage;

  return result;
}
