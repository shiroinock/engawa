use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

type Writer = Box<dyn Write + Send>;

/// PTYセッションを管理する構造体
pub struct PtyManager {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Writer>>,
    #[allow(dead_code)]
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    app_handle: AppHandle,
    current_cwd: Arc<Mutex<String>>,
}

impl PtyManager {
    /// 新しいPTYマネージャーを作成し、PTYセッションを開始
    pub fn new(app_handle: AppHandle, cols: u16, rows: u16) -> Result<Self, String> {
        let pty_system = NativePtySystem::default();

        // PTYのサイズを設定
        let pty_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        // PTYペアを作成
        let pty_pair = pty_system
            .openpty(pty_size)
            .map_err(|e| format!("PTY作成エラー: {}", e))?;

        // シェルをログインシェルとして起動
        let mut cmd = CommandBuilder::new(Self::get_shell());
        cmd.arg("-l"); // ログインシェルフラグで /etc/zprofile や ~/.zprofile を読み込む
        cmd.env("TERM", "xterm-256color");

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("シェル起動エラー: {}", e))?;

        // Writerを取得
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Writer取得エラー: {}", e))?;

        let master = Arc::new(Mutex::new(pty_pair.master));
        let writer = Arc::new(Mutex::new(writer));
        let child = Arc::new(Mutex::new(child));

        // 初期カレントディレクトリを取得
        let initial_cwd = std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/".to_string());
        let current_cwd = Arc::new(Mutex::new(initial_cwd));

        let manager = Self {
            master: Arc::clone(&master),
            writer: Arc::clone(&writer),
            child: Arc::clone(&child),
            app_handle: app_handle.clone(),
            current_cwd: Arc::clone(&current_cwd),
        };

        // 出力を読み取るスレッドを起動
        manager.start_output_reader();

        Ok(manager)
    }

    /// PTYに入力を書き込む
    pub fn write_to_pty(&self, data: String) -> Result<(), String> {
        let mut writer = self.writer.lock().unwrap();
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("PTY書き込みエラー: {}", e))?;
        writer.flush().map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    }

    /// PTYのサイズを変更
    pub fn resize_pty(&self, cols: u16, rows: u16) -> Result<(), String> {
        let master = self.master.lock().unwrap();
        let new_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        master
            .resize(new_size)
            .map_err(|e| format!("PTYリサイズエラー: {}", e))?;
        Ok(())
    }

    /// PTY出力を読み取るスレッドを起動
    fn start_output_reader(&self) {
        let master = Arc::clone(&self.master);
        let app_handle = self.app_handle.clone();

        std::thread::spawn(move || {
            let mut reader = {
                let master_lock = master.lock().unwrap();
                master_lock
                    .try_clone_reader()
                    .expect("Failed to clone reader")
            };

            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let output = String::from_utf8_lossy(&buf[..n]).to_string();
                        // Reactにイベントを送信
                        let _ = app_handle.emit("pty-output", output);
                    }
                    Err(e) => {
                        log::error!("PTY読み取りエラー: {}", e);
                        break;
                    }
                }
            }
        });
    }

    /// シェルプロセスのカレントディレクトリを取得
    pub fn get_shell_cwd(&self) -> Result<String, String> {
        let child = self.child.lock().unwrap();

        #[cfg(unix)]
        {
            use std::process::Command;

            // PIDを取得
            let pid = child.process_id()
                .ok_or_else(|| "Failed to get process ID".to_string())?;

            #[cfg(target_os = "macos")]
            {
                // macOSではlsofを使用
                let output = Command::new("lsof")
                    .args(&["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
                    .output()
                    .map_err(|e| format!("Failed to execute lsof: {}", e))?;

                let output_str = String::from_utf8_lossy(&output.stdout);
                // lsof -Fn の出力フォーマット: "n<path>"
                for line in output_str.lines() {
                    if line.starts_with('n') {
                        let new_cwd = line[1..].to_string();
                        // キャッシュも更新
                        *self.current_cwd.lock().unwrap() = new_cwd.clone();
                        return Ok(new_cwd);
                    }
                }
                Err("Failed to parse lsof output".to_string())
            }

            #[cfg(target_os = "linux")]
            {
                // Linuxでは /proc/<pid>/cwd を読み取る
                let cwd_path = format!("/proc/{}/cwd", pid);
                let cwd = std::fs::read_link(&cwd_path)
                    .map(|p| p.to_string_lossy().to_string())
                    .map_err(|e| format!("Failed to read /proc/*/cwd: {}", e))?;
                // キャッシュも更新
                *self.current_cwd.lock().unwrap() = cwd.clone();
                Ok(cwd)
            }
        }

        #[cfg(target_os = "windows")]
        {
            // Windowsの場合は現在実装していない
            Err("get_shell_cwd not implemented for Windows".to_string())
        }
    }

    /// プラットフォームに応じたシェルを取得
    fn get_shell() -> &'static str {
        #[cfg(target_os = "windows")]
        {
            "powershell.exe"
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("SHELL")
                .ok()
                .and_then(|s| if s.is_empty() { None } else { Some(s) })
                .unwrap_or_else(|| "/bin/bash".to_string())
                .leak()
        }
    }
}
