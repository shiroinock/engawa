use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

/// ファイルシステム監視を管理する構造体
pub struct FileWatcher {
    _debouncer: Arc<Mutex<Debouncer<RecommendedWatcher, RecommendedCache>>>,
    #[allow(dead_code)]
    app_handle: AppHandle,
}

impl FileWatcher {
    /// 新しいファイルウォッチャーを作成
    pub fn new(app_handle: AppHandle, path: PathBuf) -> Result<Self, String> {
        let app_handle_clone = app_handle.clone();

        // デバウンサーを作成（500ms遅延）
        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                Self::handle_event(&app_handle_clone, result);
            },
        )
        .map_err(|e| format!("Failed to create debouncer: {}", e))?;

        // 監視を開始
        debouncer
            .watch(&path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        Ok(Self {
            _debouncer: Arc::new(Mutex::new(debouncer)),
            app_handle,
        })
    }

    /// ファイルイベントを処理
    fn handle_event(app_handle: &AppHandle, result: DebounceEventResult) {
        match result {
            Ok(events) => {
                for event in events {
                    log::debug!("File event: {:?}", event);
                    // ファイル変更をReactに通知
                    let _ = app_handle.emit("file-changed", ());
                }
            }
            Err(errors) => {
                for error in errors {
                    log::error!("Watch error: {:?}", error);
                }
            }
        }
    }
}
