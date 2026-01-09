use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use serde::Serialize;
use std::path::{Path, PathBuf};
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
    _debouncer: Arc<Mutex<Debouncer<RecommendedWatcher, FileIdMap>>>,
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

    /// ディレクトリの内容を読み取る
    pub fn read_directory(&self, path: &Path) -> Result<Vec<FileNode>, String> {
        let entries = std::fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut nodes = Vec::new();

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            let metadata = entry
                .metadata()
                .map_err(|e| format!("Failed to read metadata: {}", e))?;

            let name = entry
                .file_name()
                .to_string_lossy()
                .to_string();

            // 隠しファイルをスキップ
            if name.starts_with('.') {
                continue;
            }

            let is_dir = metadata.is_dir();
            let children = if is_dir {
                // ディレクトリの場合、子要素は後で読み込む（遅延ロード）
                Some(Vec::new())
            } else {
                None
            };

            nodes.push(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                children,
            });
        }

        // 名前でソート（ディレクトリを先に）
        nodes.sort_by(|a, b| {
            if a.is_dir == b.is_dir {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            } else if a.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        });

        Ok(nodes)
    }
}
