use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::config::{CommandContext, LlmConfig};
use super::provider::{LlmError, LlmProvider};

/// OpenAI APIクライアント
pub struct OpenAiProvider {
    client: Client,
    config: LlmConfig,
}

#[derive(Debug, Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: Message,
}

impl OpenAiProvider {
    /// 新しいOpenAIプロバイダーを作成
    pub fn new(config: LlmConfig) -> Result<Self, LlmError> {
        if config.api_key.is_empty() {
            return Err(LlmError::ConfigError(
                "API key is required".to_string(),
            ));
        }

        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .map_err(|e| LlmError::ConfigError(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { client, config })
    }

    /// OpenAI APIを呼び出し
    async fn call_api(&self, messages: Vec<Message>) -> Result<String, LlmError> {
        let request = OpenAiRequest {
            model: self.config.model.clone(),
            messages,
            temperature: 0.7,
            max_tokens: 500,
        };

        // リクエスト内容をログ出力
        log::info!("=== OpenAI API Request ===");
        log::info!("Model: {}", request.model);
        log::info!("Temperature: {}", request.temperature);
        log::info!("Max tokens: {}", request.max_tokens);
        log::info!("Messages:");
        for (i, msg) in request.messages.iter().enumerate() {
            log::info!("  [{}] Role: {}", i, msg.role);
            log::info!("  [{}] Content: {}", i, msg.content);
        }
        log::info!("========================");

        let response = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                let error_msg = if e.is_timeout() {
                    "Request timeout".to_string()
                } else {
                    format!("Request failed: {}", e)
                };
                log::error!("=== OpenAI API Error ===");
                log::error!("{}", error_msg);
                log::error!("========================");
                if e.is_timeout() {
                    LlmError::Timeout
                } else {
                    LlmError::ApiError(error_msg)
                }
            })?;

        let status = response.status();
        log::info!("API Response Status: {}", status);

        if status == 401 {
            log::error!("=== OpenAI API Error ===");
            log::error!("Authentication failed (401)");
            log::error!("========================");
            return Err(LlmError::AuthenticationError);
        } else if status == 429 {
            log::error!("=== OpenAI API Error ===");
            log::error!("Rate limit exceeded (429)");
            log::error!("========================");
            return Err(LlmError::RateLimitExceeded);
        } else if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            log::error!("=== OpenAI API Error ===");
            log::error!("Status {}: {}", status, error_text);
            log::error!("========================");
            return Err(LlmError::ApiError(format!(
                "API returned status {}: {}",
                status, error_text
            )));
        }

        let api_response: OpenAiResponse = response.json().await.map_err(|e| {
            let error_msg = format!("Failed to parse response: {}", e);
            log::error!("=== OpenAI API Error ===");
            log::error!("{}", error_msg);
            log::error!("========================");
            LlmError::ApiError(error_msg)
        })?;

        let response_content = api_response
            .choices
            .first()
            .map(|choice| choice.message.content.clone())
            .ok_or_else(|| {
                log::error!("=== OpenAI API Error ===");
                log::error!("No response from API");
                log::error!("========================");
                LlmError::ApiError("No response from API".to_string())
            })?;

        // レスポンス内容をログ出力
        log::info!("=== OpenAI API Response ===");
        log::info!("Content: {}", response_content);
        log::info!("===========================");

        Ok(response_content)
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn explain_command(
        &self,
        command: &str,
        context: &CommandContext,
    ) -> Result<String, LlmError> {
        let system_message = Message {
            role: "system".to_string(),
            content: "あなたはターミナル初心者を助けるアシスタントです。シェルコマンドをわかりやすい日本語で説明してください。専門用語は避け、具体例を交えて説明してください。3-5文程度の簡潔な説明にしてください。".to_string(),
        };

        let user_message = Message {
            role: "user".to_string(),
            content: format!(
                "以下のコマンドを説明してください。\n\nコマンド: {}\nカレントディレクトリ: {}\nシェル: {}\n危険度: {}",
                command, context.current_directory, context.shell_type, context.risk_level
            ),
        };

        self.call_api(vec![system_message, user_message]).await
    }

    async fn translate_natural_language(
        &self,
        input: &str,
        context: &CommandContext,
    ) -> Result<String, LlmError> {
        let system_message = Message {
            role: "system".to_string(),
            content: format!(
                "あなたはシェルコマンド生成アシスタントです。ユーザーの日本語の指示を適切な{}コマンドに変換してください。コマンドのみを出力し、説明は不要です。",
                context.shell_type
            ),
        };

        let user_message = Message {
            role: "user".to_string(),
            content: format!(
                "カレントディレクトリ: {}\n\n以下の指示をシェルコマンドに変換してください:\n{}",
                context.current_directory, input
            ),
        };

        self.call_api(vec![system_message, user_message]).await
    }

    fn provider_name(&self) -> &str {
        "OpenAI"
    }
}
