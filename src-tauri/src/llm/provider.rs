use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::config::CommandContext;

/// トークン使用量情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageInfo {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub total_tokens: u32,
}

/// LLMエラー型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LlmError {
    /// API呼び出しエラー
    ApiError(String),
    /// タイムアウト
    Timeout,
    /// 認証エラー
    AuthenticationError,
    /// レート制限
    RateLimitExceeded,
    /// 設定エラー
    ConfigError(String),
    /// その他のエラー
    Other(String),
}

impl std::fmt::Display for LlmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LlmError::ApiError(msg) => write!(f, "API error: {}", msg),
            LlmError::Timeout => write!(f, "Request timeout"),
            LlmError::AuthenticationError => write!(f, "Authentication failed"),
            LlmError::RateLimitExceeded => write!(f, "Rate limit exceeded"),
            LlmError::ConfigError(msg) => write!(f, "Configuration error: {}", msg),
            LlmError::Other(msg) => write!(f, "Error: {}", msg),
        }
    }
}

impl std::error::Error for LlmError {}

/// LLMプロバイダーの抽象インターフェース
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// コマンドの詳細な説明を生成（コンテンツとトークン使用量を返す）
    async fn explain_command(
        &self,
        command: &str,
        context: &CommandContext,
    ) -> Result<(String, Option<UsageInfo>), LlmError>;

    /// 自然言語をシェルコマンドに変換（コンテンツとトークン使用量を返す）
    async fn translate_natural_language(
        &self,
        input: &str,
        context: &CommandContext,
    ) -> Result<(String, Option<UsageInfo>), LlmError>;

    /// プロバイダー名を取得
    #[allow(dead_code)]
    fn provider_name(&self) -> &str;
}
