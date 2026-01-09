use lru::LruCache;
use sha2::{Digest, Sha256};
use std::num::NonZeroUsize;
use std::sync::Mutex;

use super::config::CommandContext;

/// LLMレスポンスのキャッシュ
pub struct LlmCache {
    cache: Mutex<LruCache<String, String>>,
}

impl LlmCache {
    /// 新しいキャッシュを作成
    pub fn new(capacity: usize) -> Self {
        let cap = NonZeroUsize::new(capacity).unwrap_or(NonZeroUsize::new(100).unwrap());
        Self {
            cache: Mutex::new(LruCache::new(cap)),
        }
    }

    /// キャッシュキーを生成
    ///
    /// コマンド文字列、カレントディレクトリ、シェル種別からSHA256ハッシュを生成
    fn generate_key(command: &str, context: &CommandContext, operation: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(operation.as_bytes());
        hasher.update(command.as_bytes());
        hasher.update(context.current_directory.as_bytes());
        hasher.update(context.shell_type.as_bytes());

        let result = hasher.finalize();
        format!("{:x}", result)
    }

    /// キャッシュから値を取得
    pub fn get(&self, command: &str, context: &CommandContext, operation: &str) -> Option<String> {
        let key = Self::generate_key(command, context, operation);
        let mut cache = self.cache.lock().unwrap();
        cache.get(&key).cloned()
    }

    /// キャッシュに値を保存
    pub fn set(&self, command: &str, context: &CommandContext, operation: &str, value: String) {
        let key = Self::generate_key(command, context, operation);
        let mut cache = self.cache.lock().unwrap();
        cache.put(key, value);
    }

    /// キャッシュをクリア
    pub fn clear(&self) {
        let mut cache = self.cache.lock().unwrap();
        cache.clear();
    }

    /// キャッシュサイズを取得
    pub fn len(&self) -> usize {
        let cache = self.cache.lock().unwrap();
        cache.len()
    }

    /// キャッシュが空かどうか
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_set_get() {
        let cache = LlmCache::new(10);
        let context = CommandContext {
            current_directory: "/home/user".to_string(),
            shell_type: "bash".to_string(),
            risk_level: "safe".to_string(),
        };

        cache.set("ls -la", &context, "explain", "List all files".to_string());

        let result = cache.get("ls -la", &context, "explain");
        assert_eq!(result, Some("List all files".to_string()));
    }

    #[test]
    fn test_cache_miss() {
        let cache = LlmCache::new(10);
        let context = CommandContext {
            current_directory: "/home/user".to_string(),
            shell_type: "bash".to_string(),
            risk_level: "safe".to_string(),
        };

        let result = cache.get("ls -la", &context, "explain");
        assert_eq!(result, None);
    }

    #[test]
    fn test_cache_different_context() {
        let cache = LlmCache::new(10);
        let context1 = CommandContext {
            current_directory: "/home/user".to_string(),
            shell_type: "bash".to_string(),
            risk_level: "safe".to_string(),
        };
        let context2 = CommandContext {
            current_directory: "/home/other".to_string(),
            shell_type: "bash".to_string(),
            risk_level: "safe".to_string(),
        };

        cache.set("rm *.txt", &context1, "explain", "Delete text files in /home/user".to_string());

        // 異なるディレクトリでは別のキャッシュキー
        let result = cache.get("rm *.txt", &context2, "explain");
        assert_eq!(result, None);
    }
}
