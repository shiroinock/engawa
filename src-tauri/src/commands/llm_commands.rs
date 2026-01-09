use std::sync::Arc;
use tauri::State;

use crate::llm::{CommandContext, LlmCache, LlmConfig, LlmError, LlmProvider, OpenAiProvider};

/// LLMサービスの状態
pub struct LlmService {
    provider: Option<Arc<dyn LlmProvider>>,
    cache: Arc<LlmCache>,
}

impl LlmService {
    pub fn new() -> Self {
        Self {
            provider: None,
            cache: Arc::new(LlmCache::new(100)),
        }
    }

    /// プロバイダーを設定
    pub fn set_provider(&mut self, config: LlmConfig) -> Result<(), String> {
        let provider: Arc<dyn LlmProvider> = match config.provider {
            crate::llm::LlmProviderType::OpenAi => {
                Arc::new(OpenAiProvider::new(config).map_err(|e| e.to_string())?)
            }
            crate::llm::LlmProviderType::Anthropic => {
                // TODO: Anthropic実装
                return Err("Anthropic provider not yet implemented".to_string());
            }
        };

        self.provider = Some(provider);
        Ok(())
    }

    /// プロバイダーとキャッシュを取得（クローン）
    pub fn get_provider_and_cache(&self) -> Option<(Arc<dyn LlmProvider>, Arc<LlmCache>)> {
        self.provider.as_ref().map(|p| (p.clone(), self.cache.clone()))
    }

}

impl Default for LlmService {
    fn default() -> Self {
        Self::new()
    }
}

/// LLMプロバイダーを設定
#[tauri::command]
pub async fn configure_llm_provider(
    config: LlmConfig,
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<(), String> {
    let mut service = llm_service.lock().unwrap();
    service.set_provider(config)
}

/// コマンドの詳細な説明を取得
#[tauri::command]
pub async fn explain_command_with_llm(
    command: String,
    context: CommandContext,
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<String, String> {
    // プロバイダーとキャッシュをクローン（Mutexを早期解放）
    let (provider, cache) = {
        let service = llm_service.lock().unwrap();
        service
            .get_provider_and_cache()
            .ok_or_else(|| "LLM provider not configured".to_string())?
    };

    // キャッシュをチェック
    if let Some(cached) = cache.get(&command, &context, "explain") {
        log::info!("Cache hit for command: {}", command);
        return Ok(cached);
    }

    // LLM API呼び出し（Mutexから解放済み）
    log::info!("Calling LLM API for command: {}", command);
    let result = provider
        .explain_command(&command, &context)
        .await
        .map_err(|e| e.to_string())?;

    // キャッシュに保存
    cache.set(&command, &context, "explain", result.clone());

    Ok(result)
}

/// 自然言語をシェルコマンドに変換
#[tauri::command]
pub async fn translate_natural_language_to_command(
    input: String,
    context: CommandContext,
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<String, String> {
    // プロバイダーとキャッシュをクローン（Mutexを早期解放）
    let (provider, cache) = {
        let service = llm_service.lock().unwrap();
        service
            .get_provider_and_cache()
            .ok_or_else(|| "LLM provider not configured".to_string())?
    };

    // キャッシュをチェック
    if let Some(cached) = cache.get(&input, &context, "translate") {
        log::info!("Cache hit for natural language: {}", input);
        return Ok(cached);
    }

    // LLM API呼び出し（Mutexから解放済み）
    log::info!("Calling LLM API for natural language: {}", input);
    let result = provider
        .translate_natural_language(&input, &context)
        .await
        .map_err(|e| e.to_string())?;

    // キャッシュに保存
    cache.set(&input, &context, "translate", result.clone());

    Ok(result)
}
