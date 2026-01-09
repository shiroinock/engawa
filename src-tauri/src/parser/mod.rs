use serde::{Deserialize, Serialize};

/// コマンドの危険度レベル
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Safe,      // 安全 - cd, ls, pwd など
    Caution,   // 注意 - mv, cp, mkdir など
    Dangerous, // 危険 - rm, sudo rm など
}

/// パース結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    pub command: String,
    pub args: Vec<String>,
    pub risk_level: RiskLevel,
    pub description: String,
    pub targets: Vec<String>, // 影響を受けるファイル/パターン
}

/// コマンドをパースして危険度を判定
pub fn parse_command(input: &str) -> Option<ParseResult> {
    let input = input.trim();

    if input.is_empty() {
        return None;
    }

    // シンプルな空白区切りでトークン化（引用符は未対応）
    let tokens: Vec<&str> = input.split_whitespace().collect();

    if tokens.is_empty() {
        return None;
    }

    let base_command = tokens[0];
    let args: Vec<String> = tokens[1..].iter().map(|s| s.to_string()).collect();

    // sudoの場合、実際のコマンドを取得
    let (actual_command, actual_args, has_sudo) = if base_command == "sudo" && !args.is_empty() {
        (args[0].as_str(), args[1..].to_vec(), true)
    } else {
        (base_command, args.clone(), false)
    };

    // コマンドごとの危険度判定
    let (risk_level, description) = match actual_command {
        // 安全なコマンド
        "cd" => (RiskLevel::Safe, "ディレクトリを移動します"),
        "ls" | "ll" | "la" => (RiskLevel::Safe, "ファイル一覧を表示します"),
        "pwd" => (RiskLevel::Safe, "カレントディレクトリを表示します"),
        "cat" | "less" | "more" | "head" | "tail" => {
            (RiskLevel::Safe, "ファイルの内容を表示します")
        }
        "echo" => (RiskLevel::Safe, "テキストを出力します"),
        "which" | "whereis" => (RiskLevel::Safe, "コマンドの場所を表示します"),
        "man" | "help" => (RiskLevel::Safe, "ヘルプを表示します"),

        // 注意が必要なコマンド
        "mkdir" => (RiskLevel::Caution, "新しいディレクトリを作成します"),
        "touch" => (RiskLevel::Caution, "ファイルを作成または更新します"),
        "cp" => {
            if has_sudo {
                (RiskLevel::Dangerous, "⚠️ 管理者権限でファイルをコピーします")
            } else {
                (RiskLevel::Caution, "ファイルをコピーします（上書き注意）")
            }
        }
        "mv" => {
            if has_sudo {
                (RiskLevel::Dangerous, "⚠️ 管理者権限でファイルを移動します")
            } else {
                (RiskLevel::Caution, "ファイルを移動します（上書き注意）")
            }
        }
        "chmod" | "chown" => {
            if has_sudo {
                (RiskLevel::Dangerous, "⚠️ 管理者権限でファイル権限を変更します")
            } else {
                (RiskLevel::Caution, "ファイル権限を変更します")
            }
        }

        // 危険なコマンド
        "rm" => {
            let has_recursive = actual_args.iter().any(|arg| arg.contains("r") && arg.starts_with('-'));
            let has_force = actual_args.iter().any(|arg| arg.contains("f") && arg.starts_with('-'));
            let targets_root = actual_args.iter().any(|arg| arg == "/" || arg.starts_with("/*"));

            if targets_root {
                (RiskLevel::Dangerous, "🚨 ルートディレクトリを削除しようとしています！")
            } else if has_recursive && has_force {
                (RiskLevel::Dangerous, "⚠️ 強制的に再帰削除します（取り消し不可）")
            } else if has_recursive {
                (RiskLevel::Dangerous, "⚠️ ディレクトリごと削除します（取り消し不可）")
            } else if has_sudo {
                (RiskLevel::Dangerous, "⚠️ 管理者権限でファイルを削除します")
            } else {
                (RiskLevel::Caution, "ファイルを削除します（取り消し不可）")
            }
        }
        "rmdir" => (RiskLevel::Caution, "空のディレクトリを削除します"),

        // その他sudoコマンドは危険
        _ if has_sudo => (RiskLevel::Dangerous, "⚠️ 管理者権限でコマンドを実行します"),

        // 不明なコマンド
        _ => return None,
    };

    // 影響を受けるファイル/パターンを抽出
    let targets = extract_targets(actual_command, &actual_args);

    Some(ParseResult {
        command: base_command.to_string(),
        args,
        risk_level,
        description: description.to_string(),
        targets,
    })
}

/// コマンドから影響を受けるファイル/パターンを抽出
fn extract_targets(command: &str, args: &[String]) -> Vec<String> {
    match command {
        // 削除・移動・コピー系: オプション以外の引数がターゲット
        "rm" | "rmdir" => {
            args.iter()
                .filter(|arg| !arg.starts_with('-'))
                .cloned()
                .collect()
        }
        "mv" | "cp" => {
            // mvとcpは最初の引数（移動元）のみがターゲット
            // 最後の引数（移動先）は新しい場所なので除外
            args.iter()
                .filter(|arg| !arg.starts_with('-'))
                .take(args.len().saturating_sub(1))
                .cloned()
                .collect()
        }
        "mkdir" | "touch" => {
            // 作成系: オプション以外の全ての引数
            args.iter()
                .filter(|arg| !arg.starts_with('-'))
                .cloned()
                .collect()
        }
        // その他のコマンドはターゲットなし
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_commands() {
        let result = parse_command("ls -la").unwrap();
        assert_eq!(result.risk_level, RiskLevel::Safe);

        let result = parse_command("cd /home").unwrap();
        assert_eq!(result.risk_level, RiskLevel::Safe);
    }

    #[test]
    fn test_caution_commands() {
        let result = parse_command("mv file1 file2").unwrap();
        assert_eq!(result.risk_level, RiskLevel::Caution);

        let result = parse_command("rm file.txt").unwrap();
        assert_eq!(result.risk_level, RiskLevel::Caution);
    }

    #[test]
    fn test_dangerous_commands() {
        let result = parse_command("rm -rf directory").unwrap();
        assert_eq!(result.risk_level, RiskLevel::Dangerous);

        let result = parse_command("sudo rm file.txt").unwrap();
        assert_eq!(result.risk_level, RiskLevel::Dangerous);
    }

    #[test]
    fn test_root_deletion() {
        let result = parse_command("rm -rf /").unwrap();
        assert_eq!(result.risk_level, RiskLevel::Dangerous);
        assert!(result.description.contains("ルート"));
    }
}
