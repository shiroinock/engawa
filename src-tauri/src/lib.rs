mod pty;

use pty::PtyManager;
use std::sync::Mutex;
use tauri::State;

/// アプリケーションの状態
struct AppState {
    pty_manager: Mutex<Option<PtyManager>>,
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
        })
        .invoke_handler(tauri::generate_handler![create_pty, write_to_pty, resize_pty])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
