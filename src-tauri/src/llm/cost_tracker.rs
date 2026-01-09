use chrono::Datelike;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// モデルごとの料金設定（1Mトークンあたりのドル）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub input_per_million: f64,  // 入力トークン単価
    pub output_per_million: f64, // 出力トークン単価
}

/// コスト使用量の記録
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostRecord {
    pub timestamp: i64,          // Unix timestamp
    pub provider: String,        // "OpenAI", "Anthropic"
    pub model: String,           // "gpt-4o-mini", etc.
    pub input_tokens: u32,       // 入力トークン数
    pub output_tokens: u32,      // 出力トークン数
    pub cost: f64,               // コスト（ドル）
}

/// コスト管理設定
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostSettings {
    pub daily_limit: Option<f64>,   // 日間上限（ドル）
    pub monthly_limit: Option<f64>, // 月間上限（ドル）
    pub enabled: bool,               // コスト管理の有効/無効
}

impl Default for CostSettings {
    fn default() -> Self {
        Self {
            daily_limit: Some(0.50),   // デフォルト: $0.50/日
            monthly_limit: Some(5.00), // デフォルト: $5.00/月
            enabled: true,
        }
    }
}

/// コストトラッカー
pub struct CostTracker {
    records: Mutex<Vec<CostRecord>>,
    pricing: HashMap<String, ModelPricing>,
    settings: Mutex<CostSettings>,
}

impl CostTracker {
    /// 新しいコストトラッカーを作成
    pub fn new() -> Self {
        let mut pricing = HashMap::new();

        // OpenAI料金設定（2025年1月時点の概算）
        pricing.insert(
            "gpt-4o-mini".to_string(),
            ModelPricing {
                input_per_million: 0.15,
                output_per_million: 0.60,
            },
        );
        pricing.insert(
            "gpt-4o".to_string(),
            ModelPricing {
                input_per_million: 2.50,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            "gpt-3.5-turbo".to_string(),
            ModelPricing {
                input_per_million: 0.50,
                output_per_million: 1.50,
            },
        );

        // Anthropic料金設定（2025年1月時点の概算）
        pricing.insert(
            "claude-3-5-sonnet".to_string(),
            ModelPricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        pricing.insert(
            "claude-3-haiku".to_string(),
            ModelPricing {
                input_per_million: 0.25,
                output_per_million: 1.25,
            },
        );

        Self {
            records: Mutex::new(Vec::new()),
            pricing,
            settings: Mutex::new(CostSettings::default()),
        }
    }

    /// 使用量を記録
    pub fn record_usage(
        &self,
        provider: String,
        model: String,
        input_tokens: u32,
        output_tokens: u32,
    ) -> f64 {
        let cost = self.calculate_cost(&model, input_tokens, output_tokens);

        let record = CostRecord {
            timestamp: chrono::Utc::now().timestamp(),
            provider,
            model,
            input_tokens,
            output_tokens,
            cost,
        };

        let mut records = self.records.lock().unwrap();
        records.push(record);

        cost
    }

    /// コストを計算
    fn calculate_cost(&self, model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        if let Some(pricing) = self.pricing.get(model) {
            let input_cost = (input_tokens as f64 / 1_000_000.0) * pricing.input_per_million;
            let output_cost = (output_tokens as f64 / 1_000_000.0) * pricing.output_per_million;
            input_cost + output_cost
        } else {
            // 料金不明の場合はデフォルト料金を適用
            let default_pricing = ModelPricing {
                input_per_million: 1.0,
                output_per_million: 3.0,
            };
            let input_cost = (input_tokens as f64 / 1_000_000.0) * default_pricing.input_per_million;
            let output_cost =
                (output_tokens as f64 / 1_000_000.0) * default_pricing.output_per_million;
            input_cost + output_cost
        }
    }

    /// 日間コストを取得
    pub fn get_daily_cost(&self) -> f64 {
        let records = self.records.lock().unwrap();
        let today_start = chrono::Utc::now()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();

        records
            .iter()
            .filter(|r| r.timestamp >= today_start)
            .map(|r| r.cost)
            .sum()
    }

    /// 月間コストを取得
    pub fn get_monthly_cost(&self) -> f64 {
        let records = self.records.lock().unwrap();
        let now = chrono::Utc::now();
        let month_start = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();

        records
            .iter()
            .filter(|r| r.timestamp >= month_start)
            .map(|r| r.cost)
            .sum()
    }

    /// 予算超過チェック
    pub fn check_budget_exceeded(&self) -> Option<String> {
        let settings = self.settings.lock().unwrap();

        if !settings.enabled {
            return None;
        }

        let daily_cost = self.get_daily_cost();
        let monthly_cost = self.get_monthly_cost();

        if let Some(daily_limit) = settings.daily_limit {
            if daily_cost >= daily_limit {
                return Some(format!(
                    "日間予算を超過しました: ${:.4} / ${:.2}",
                    daily_cost, daily_limit
                ));
            }
        }

        if let Some(monthly_limit) = settings.monthly_limit {
            if monthly_cost >= monthly_limit {
                return Some(format!(
                    "月間予算を超過しました: ${:.4} / ${:.2}",
                    monthly_cost, monthly_limit
                ));
            }
        }

        None
    }

    /// コスト設定を更新
    pub fn update_settings(&self, settings: CostSettings) {
        let mut current_settings = self.settings.lock().unwrap();
        *current_settings = settings;
    }

    /// コスト設定を取得
    pub fn get_settings(&self) -> CostSettings {
        self.settings.lock().unwrap().clone()
    }

    /// 全記録を取得
    pub fn get_all_records(&self) -> Vec<CostRecord> {
        self.records.lock().unwrap().clone()
    }

    /// 記録をクリア（テスト用）
    #[allow(dead_code)]
    pub fn clear_records(&self) {
        let mut records = self.records.lock().unwrap();
        records.clear();
    }

    /// 記録をロード
    pub fn load_records(&self, records: Vec<CostRecord>) {
        let mut current_records = self.records.lock().unwrap();
        *current_records = records;
    }
}

impl Default for CostTracker {
    fn default() -> Self {
        Self::new()
    }
}
