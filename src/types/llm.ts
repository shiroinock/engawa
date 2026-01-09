// LLMプロバイダーの種類
export type LlmProviderType = 'OpenAi' | 'Anthropic';

// LLM設定
export interface LlmConfig {
  provider: LlmProviderType;
  api_key: string;
  model: string;
  timeout_seconds?: number;
  cache_enabled?: boolean;
}

// コマンドのコンテキスト
export interface CommandContext {
  current_directory: string;
  shell_type: string;
  risk_level: string;
}
