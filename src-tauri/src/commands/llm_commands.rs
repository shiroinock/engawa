use std::sync::Arc;
use tauri::State;

use crate::llm::{CacheEntry, CommandContext, LlmCache, LlmConfig, LlmProvider, OpenAiProvider, CostTracker, CostSettings, CostRecord};

/// LLMサービスの状態
pub struct LlmService {
    provider: Option<Arc<dyn LlmProvider>>,
    cache: Arc<LlmCache>,
    cost_tracker: Arc<CostTracker>,
}

impl LlmService {
    pub fn new() -> Self {
        Self {
            provider: None,
            cache: Arc::new(LlmCache::new(100)),
            cost_tracker: Arc::new(CostTracker::new()),
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

    /// プロバイダー、キャッシュ、コストトラッカーを取得（クローン）
    pub fn get_provider_and_cache(&self) -> Option<(Arc<dyn LlmProvider>, Arc<LlmCache>, Arc<CostTracker>)> {
        self.provider.as_ref().map(|p| (p.clone(), self.cache.clone(), self.cost_tracker.clone()))
    }

    /// コストトラッカーを取得
    pub fn get_cost_tracker(&self) -> Arc<CostTracker> {
        self.cost_tracker.clone()
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
    // プロバイダー、キャッシュ、コストトラッカーをクローン（Mutexを早期解放）
    let (provider, cache, _cost_tracker) = {
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
    // プロバイダー、キャッシュ、コストトラッカーをクローン（Mutexを早期解放）
    let (provider, cache, _cost_tracker) = {
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

/// コスト設定を取得
#[tauri::command]
pub fn get_cost_settings(
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<CostSettings, String> {
    let service = llm_service.lock().unwrap();
    let cost_tracker = service.get_cost_tracker();
    Ok(cost_tracker.get_settings())
}

/// コスト設定を更新
#[tauri::command]
pub fn update_cost_settings(
    settings: CostSettings,
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<(), String> {
    let service = llm_service.lock().unwrap();
    let cost_tracker = service.get_cost_tracker();
    cost_tracker.update_settings(settings);
    Ok(())
}

/// コスト情報を取得
#[tauri::command]
pub fn get_cost_info(
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<serde_json::Value, String> {
    let service = llm_service.lock().unwrap();
    let cost_tracker = service.get_cost_tracker();

    let daily_cost = cost_tracker.get_daily_cost();
    let monthly_cost = cost_tracker.get_monthly_cost();
    let settings = cost_tracker.get_settings();

    Ok(serde_json::json!({
        "daily_cost": daily_cost,
        "monthly_cost": monthly_cost,
        "daily_limit": settings.daily_limit,
        "monthly_limit": settings.monthly_limit,
        "enabled": settings.enabled,
    }))
}

/// コスト履歴を取得
#[tauri::command]
pub fn get_cost_records(
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<Vec<CostRecord>, String> {
    let service = llm_service.lock().unwrap();
    let cost_tracker = service.get_cost_tracker();
    Ok(cost_tracker.get_all_records())
}

/// キャッシュを保存用のデータとして取得
#[tauri::command]
pub fn get_cache_data(
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<Vec<CacheEntry>, String> {
    let service = llm_service.lock().unwrap();
    let cache = service.cache.clone();
    Ok(cache.to_entries())
}

/// キャッシュをロード
#[tauri::command]
pub fn load_cache_data(
    entries: Vec<CacheEntry>,
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<(), String> {
    let service = llm_service.lock().unwrap();
    let cache = service.cache.clone();
    cache.from_entries(entries);
    Ok(())
}

/// コスト履歴をロード
#[tauri::command]
pub fn load_cost_records(
    records: Vec<CostRecord>,
    llm_service: State<'_, Arc<std::sync::Mutex<LlmService>>>,
) -> Result<(), String> {
    let service = llm_service.lock().unwrap();
    let cost_tracker = service.get_cost_tracker();
    cost_tracker.load_records(records);
    Ok(())
}
