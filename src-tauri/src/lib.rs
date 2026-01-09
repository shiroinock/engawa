mod commands;
mod fs;
mod llm;
mod parser;
mod pty;

use commands::LlmService;
use fs::FileWatcher;
use parser::ParseResult;
use pty::PtyManager;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

/// アプリケーションの状態
struct AppState {
    pty_manager: Mutex<Option<PtyManager>>,
    file_watcher: Mutex<Option<FileWatcher>>,
}

/// PTYセッションを作成
#[tauri::command]
fn create_pty(
    state: State<AppState>,
    app_handle: tauri::AppHandle,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut pty_manager_lock = state.pty_manager.lock().unwrap();

    // 新しいPTYマネージャーを作成
    let pty_manager = PtyManager::new(app_handle, cols, rows)?;

    *pty_manager_lock = Some(pty_manager);

    Ok(())
}

/// PTYに入力を書き込む
#[tauri::command]
fn write_to_pty(state: State<AppState>, data: String) -> Result<(), String> {
    let pty_manager_lock = state.pty_manager.lock().unwrap();

    if let Some(ref manager) = *pty_manager_lock {
        manager.write_to_pty(data)
    } else {
        Err("PTYが初期化されていません".to_string())
    }
}

/// PTYのサイズを変更
#[tauri::command]
fn resize_pty(state: State<AppState>, cols: u16, rows: u16) -> Result<(), String> {
    let pty_manager_lock = state.pty_manager.lock().unwrap();

    if let Some(ref manager) = *pty_manager_lock {
        manager.resize_pty(cols, rows)
    } else {
        Err("PTYが初期化されていません".to_string())
    }
}

/// カレントディレクトリを取得（PTYのシェルプロセスのカレントディレクトリ）
#[tauri::command]
fn get_current_directory(state: tauri::State<AppState>) -> Result<String, String> {
    let pty_manager = state.pty_manager.lock().unwrap();

    if let Some(ref manager) = *pty_manager {
        // PTYのシェルプロセスのカレントディレクトリを取得
        // lsofを実行してリアルタイムで取得
        manager.get_shell_cwd()
    } else {
        // PTYが作成されていない場合はRustプロセスのカレントディレクトリを返す
        std::env::current_dir()
            .map(|path| path.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to get current directory: {}", e))
    }
}

/// ディレクトリの内容を読み取る
#[tauri::command]
fn read_directory(path: String) -> Result<Vec<fs::FileNode>, String> {
    use std::fs as std_fs;

    let path = PathBuf::from(path);
    let entries = std_fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut nodes = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
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
        let children = if is_dir { Some(Vec::new()) } else { None };

        nodes.push(fs::FileNode {
            name,
            path: entry_path.to_string_lossy().to_string(),
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

/// ディレクトリの監視を開始
#[tauri::command]
fn watch_directory(
    state: State<AppState>,
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    let watcher = FileWatcher::new(app_handle, path)?;

    let mut file_watcher_lock = state.file_watcher.lock().unwrap();
    *file_watcher_lock = Some(watcher);

    Ok(())
}

/// コマンドをパースして危険度を判定
#[tauri::command]
fn parse_command(input: String) -> Option<ParseResult> {
    parser::parse_command(&input)
}

/// ディレクトリをFinderやExplorerで開く
#[tauri::command]
fn open_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open in Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open in Explorer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open in file manager: {}", e))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(AppState {
            pty_manager: Mutex::new(None),
            file_watcher: Mutex::new(None),
        })
        .manage(Arc::new(Mutex::new(LlmService::new())))
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_to_pty,
            resize_pty,
            get_current_directory,
            read_directory,
            watch_directory,
            parse_command,
            open_in_finder,
            commands::llm_commands::configure_llm_provider,
            commands::llm_commands::explain_command_with_llm,
            commands::llm_commands::translate_natural_language_to_command,
            commands::llm_commands::get_cost_settings,
            commands::llm_commands::update_cost_settings,
            commands::llm_commands::get_cost_info,
            commands::llm_commands::get_cost_records,
            commands::llm_commands::get_cache_data,
            commands::llm_commands::load_cache_data,
            commands::llm_commands::load_cost_records,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
