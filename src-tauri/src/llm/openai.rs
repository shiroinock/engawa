use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::config::{CommandContext, LlmConfig};
use super::provider::{LlmError, LlmProvider, UsageInfo};

/// OpenAI APIクライアント
pub struct OpenAiProvider {
    client: Client,
    config: LlmConfig,
}

#[derive(Debug, Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    max_completion_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiResponse {
    choices: Vec<Choice>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: Message,
}

#[derive(Debug, Deserialize)]
struct Usage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

impl OpenAiProvider {
    /// カレントディレクトリパスをマスキング（機密情報の保護）
    fn mask_directory_path(path: &str) -> String {
        // /Users/username/projects/myapp -> /Users/[user]/projects/[dir]
        let parts: Vec<&str> = path.split('/').collect();

        if parts.is_empty() {
            return "[directory]".to_string();
        }

        let masked_parts: Vec<String> = parts
            .iter()
            .enumerate()
            .map(|(i, part)| {
                if part.is_empty() {
                    String::new()
                } else if i == 0 {
                    // ルート要素はそのまま
                    part.to_string()
                } else if i == 1 && (parts[0] == "" || parts[0] == "/") && *part == "Users" {
                    // /Users はそのまま
                    part.to_string()
                } else if i == 2 && parts.get(1) == Some(&"Users") {
                    // ユーザー名をマスク
                    "[user]".to_string()
                } else {
                    // その他のディレクトリ名をマスク
                    "[dir]".to_string()
                }
            })
            .collect();

        masked_parts.join("/")
    }

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

    /// OpenAI APIを呼び出し（コンテンツとトークン使用量を返す）
    async fn call_api(&self, messages: Vec<Message>) -> Result<(String, Option<UsageInfo>), LlmError> {
        let request = OpenAiRequest {
            model: self.config.model.clone(),
            messages,
            temperature: None, // モデルのデフォルト値を使用
            max_completion_tokens: 2000, // reasoning モデル用に増量（推論 + 出力）
        };

        // リクエスト内容をログ出力
        log::info!(
            "OpenAI API Request: model={}, max_tokens={}",
            request.model,
            request.max_completion_tokens
        );

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

        // エラーステータスの場合
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

        // JSONをパース
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
                log::error!("No response from API (choices array is empty)");
                log::error!("========================");
                LlmError::ApiError("No response from API".to_string())
            })?;

        // レスポンス内容をログ出力（長さのみ）
        log::info!(
            "OpenAI API Response: {} characters",
            response_content.len()
        );

        // トークン使用量をログ出力とUsageInfo変換
        let usage_info = api_response.usage.map(|usage| {
            log::info!(
                "Token usage: input={}, output={}, total={}",
                usage.prompt_tokens,
                usage.completion_tokens,
                usage.total_tokens
            );
            UsageInfo {
                input_tokens: usage.prompt_tokens,
                output_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens,
            }
        });

        Ok((response_content, usage_info))
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn explain_command(
        &self,
        command: &str,
        context: &CommandContext,
    ) -> Result<(String, Option<UsageInfo>), LlmError> {
        let system_message = Message {
            role: "system".to_string(),
            content: "あなたはターミナル初心者を助けるアシスタントです。シェルコマンドをわかりやすい日本語で説明してください。専門用語は避け、具体例を交えて説明してください。3-5文程度の簡潔な説明にしてください。".to_string(),
        };

        let user_message = Message {
            role: "user".to_string(),
            content: format!(
                "以下のコマンドを説明してください。\n\nコマンド: {}\nシェル: {}\n危険度: {}",
                command, context.shell_type, context.risk_level
            ),
        };

        self.call_api(vec![system_message, user_message]).await
    }

    async fn translate_natural_language(
        &self,
        input: &str,
        context: &CommandContext,
    ) -> Result<(String, Option<UsageInfo>), LlmError> {
        let system_message = Message {
            role: "system".to_string(),
            content: format!(
                "あなたはシェルコマンド生成アシスタントです。ユーザーの日本語の指示を適切な{}コマンドに変換してください。コマンドのみを出力し、説明は不要です。",
                context.shell_type
            ),
        };

        // カレントディレクトリパスをマスキング（機密情報の保護）
        let masked_dir = Self::mask_directory_path(&context.current_directory);

        let user_message = Message {
            role: "user".to_string(),
            content: format!(
                "カレントディレクトリ: {}\n\n以下の指示をシェルコマンドに変換してください:\n{}",
                masked_dir, input
            ),
        };

        self.call_api(vec![system_message, user_message]).await
    }

    fn provider_name(&self) -> &str {
        "OpenAI"
    }
}
