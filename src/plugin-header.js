//@name Cupcake_Provider_Manager
//@display-name Cupcake Provider Manager
//@api 3.0
//@version 1.20.13
//@update-url https://cupcake-plugin-manager-test.vercel.app/api/main-plugin

// ==========================================
// ARGUMENT SCHEMAS (Saved Natively by RisuAI)
// ==========================================

// --- Slot Assignments ---
//@arg cpm_slot_translation string 번역 보조 모델
//@arg cpm_slot_emotion string 감정 보조 모델
//@arg cpm_slot_memory string 메모리 보조 모델
//@arg cpm_slot_other string 기타(유틸) 보조 모델

// --- Global Provider Configs ---
// OpenAI
//@arg cpm_openai_url string OpenAI Base URL
//@arg cpm_openai_key string OpenAI API Key
//@arg cpm_openai_model string OpenAI Model
//@arg cpm_openai_reasoning string OpenAI Reasoning Effort (none, low, medium, high, xhigh)
//@arg cpm_openai_verbosity string OpenAI Verbosity (none, low, medium, high)
//@arg cpm_dynamic_openai string Dynamic OpenAI Model Fetch (true/false)
// Anthropic
//@arg cpm_anthropic_url string Anthropic Base URL
//@arg cpm_anthropic_key string Anthropic API Key
//@arg cpm_anthropic_model string Anthropic Model
//@arg cpm_anthropic_thinking_budget int Anthropic Thinking Budget
//@arg cpm_anthropic_thinking_effort string Anthropic Thinking Effort (none/low/medium/high)
//@arg cpm_anthropic_cache_ttl string Anthropic Cache TTL (default/1h)
//@arg cpm_dynamic_anthropic string Dynamic Anthropic Model Fetch (true/false)
// Gemini
//@arg cpm_gemini_key string Gemini API Key
//@arg cpm_gemini_model string Gemini Model
//@arg cpm_gemini_thinking_level string Gemini Thinking Level (off, MINIMAL, LOW, MEDIUM, HIGH)
//@arg cpm_gemini_thinking_budget int Gemini Thinking Budget
//@arg cpm_dynamic_googleai string Dynamic Gemini Model Fetch (true/false)
// Vertex
//@arg cpm_vertex_key_json string Vertex Service Account JSON
//@arg cpm_vertex_location string Vertex Location (e.g. us-central1, global)
//@arg cpm_vertex_model string Vertex Model
//@arg cpm_vertex_thinking_level string Vertex Thinking Level (off, MINIMAL, LOW, MEDIUM, HIGH)
//@arg cpm_vertex_thinking_budget int Vertex Gemini Thinking Budget
//@arg cpm_vertex_claude_thinking_budget int Vertex Claude Thinking Budget
//@arg cpm_vertex_claude_effort string Vertex Claude Adaptive Thinking Effort (low/medium/high/max)
//@arg chat_vertex_preserveSystem string Vertex Preserve System Prompt (true/false)
//@arg chat_vertex_showThoughtsToken string Vertex Show Thoughts Token (true/false)
//@arg chat_vertex_useThoughtSignature string Vertex Use Thought Signature (true/false)
//@arg cpm_dynamic_vertexai string Dynamic Vertex Model Fetch (true/false)
// AWS Bedrock
//@arg cpm_aws_key string AWS Access Key
//@arg cpm_aws_secret string AWS Secret Access Key
//@arg cpm_aws_region string AWS Region
//@arg cpm_aws_thinking_budget int AWS Thinking Budget
//@arg cpm_aws_thinking_effort string AWS Thinking Effort (none/low/medium/high)
//@arg cpm_dynamic_aws string Dynamic AWS Model Fetch (true/false)
// DeepSeek
//@arg cpm_deepseek_url string DeepSeek Base URL
//@arg cpm_deepseek_key string DeepSeek API Key
//@arg cpm_deepseek_model string DeepSeek Model
//@arg cpm_dynamic_deepseek string Dynamic DeepSeek Model Fetch (true/false)
// OpenRouter
//@arg cpm_openrouter_url string OpenRouter Base URL
//@arg cpm_openrouter_key string OpenRouter API Key
//@arg cpm_openrouter_model string OpenRouter Model
//@arg cpm_openrouter_reasoning string OpenRouter Reasoning Effort (none, low, medium, high, xhigh)
//@arg cpm_openrouter_provider string OpenRouter Provider String (e.g., Hyperbolic)
//@arg cpm_dynamic_openrouter string Dynamic OpenRouter Model Fetch (true/false)

// --- Dynamic Custom Models JSON Storage ---
//@arg cpm_custom_models string Custom Models JSON Array (DO NOT EDIT MANUALLY)

// --- Global Tool Configs ---
//@arg tools_githubCopilotToken string GitHub Copilot Token

// --- Global Chat Configs ---
//@arg chat_claude_caching string Claude Caching (true/false)
//@arg chat_claude_cachingBreakpoints string Claude Caching Breakpoints (e.g., 1000,2000)
//@arg chat_claude_cachingMaxExtension string Claude Caching Max Extension (e.g., 500)
//@arg chat_gemini_preserveSystem string Gemini Preserve System Prompt (true/false)
//@arg chat_gemini_showThoughtsToken string Gemini Show Thoughts Token (true/false)
//@arg chat_gemini_useThoughtSignature string Gemini Use Thought Signature (true/false)
//@arg chat_gemini_usePlainFetch string Gemini Use Plain Fetch (true/false)
//@arg common_openai_servicetier string OpenAI Service Tier (Auto, Flex, Default)

// --- Streaming Settings ---
//@arg cpm_streaming_enabled string Enable Streaming Pass-Through (true/false)
//@arg cpm_streaming_show_thinking string Show Anthropic Thinking Tokens in Stream (true/false)

// --- Compatibility ---
//@arg cpm_compatibility_mode string Compatibility Mode — skip nativeFetch, use risuFetch only. Enable if requests hang or fail on iPhone/Safari. (true/false)
//@arg cpm_copilot_nodeless_mode string Copilot Node-less Experimental Mode (off, nodeless-1, nodeless-2)
