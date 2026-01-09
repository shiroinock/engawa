use serde::{Deserialize, Serialize};

/// LLMプロバイダーの種類
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum LlmProviderType {
    OpenAi,
    Anthropic,
    // 将来的に追加: LiteLlm
}

/// LLM設定
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    /// プロバイダー種別
    pub provider: LlmProviderType,
    /// APIキー
    pub api_key: String,
    /// モデル名（例: "gpt-4", "claude-3-5-sonnet"）
    pub model: String,
    /// タイムアウト（秒）
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
    /// キャッシュ有効化
    #[serde(default = "default_cache_enabled")]
    pub cache_enabled: bool,
}

fn default_timeout() -> u64 {
    30
}

fn default_cache_enabled() -> bool {
    true
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            provider: LlmProviderType::OpenAi,
            api_key: String::new(),
            model: "gpt-4o-mini".to_string(),
            timeout_seconds: default_timeout(),
            cache_enabled: default_cache_enabled(),
        }
    }
}

/// コマンドのコンテキスト情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandContext {
    /// カレントディレクトリ
    pub current_directory: String,
    /// シェルの種類（bash, zsh, fish等）
    pub shell_type: String,
    /// 危険度レベル
    pub risk_level: String,
}
