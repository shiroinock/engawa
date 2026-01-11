use regex::Regex;
use serde::{Deserialize, Serialize};

/// エラーの種類
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ErrorType {
    CommandNotFound,
    PermissionDenied,
    NoSuchFileOrDirectory,
    SyntaxError,
    ConnectionRefused,
    PortInUse,
    DiskFull,
    Unknown,
}

/// 検出されたエラー情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedError {
    pub error_type: ErrorType,
    pub original_message: String,
    pub extracted_info: Option<String>, // 例: ファイル名、コマンド名など
}

/// エラーパターン検出器
pub struct ErrorDetector {
    patterns: Vec<(ErrorType, Regex)>,
}

impl ErrorDetector {
    pub fn new() -> Self {
        let patterns = vec![
            // command not found
            (
                ErrorType::CommandNotFound,
                Regex::new(r"(?:bash|zsh|sh):\s*([^:]+):\s*command not found").unwrap(),
            ),
            (
                ErrorType::CommandNotFound,
                Regex::new(r"([^:]+):\s*command not found").unwrap(),
            ),
            // permission denied
            (
                ErrorType::PermissionDenied,
                Regex::new(r"(?i)permission denied").unwrap(),
            ),
            // no such file or directory
            (
                ErrorType::NoSuchFileOrDirectory,
                Regex::new(r"(?i)no such file or directory").unwrap(),
            ),
            // syntax error
            (
                ErrorType::SyntaxError,
                Regex::new(r"(?i)syntax error").unwrap(),
            ),
            // connection refused
            (
                ErrorType::ConnectionRefused,
                Regex::new(r"(?i)connection refused").unwrap(),
            ),
            // port already in use
            (
                ErrorType::PortInUse,
                Regex::new(r"(?i)(?:port|address) already in use").unwrap(),
            ),
            // disk full
            (
                ErrorType::DiskFull,
                Regex::new(r"(?i)(?:no space left on device|disk full)").unwrap(),
            ),
        ];

        Self { patterns }
    }

    /// PTY出力からエラーを検出
    pub fn detect(&self, output: &str) -> Option<DetectedError> {
        // 各行を検査
        for line in output.lines() {
            if let Some(error) = self.detect_line(line) {
                return Some(error);
            }
        }
        None
    }

    /// 1行からエラーを検出
    fn detect_line(&self, line: &str) -> Option<DetectedError> {
        for (error_type, pattern) in &self.patterns {
            if let Some(captures) = pattern.captures(line) {
                let extracted_info = captures.get(1).map(|m| m.as_str().to_string());

                return Some(DetectedError {
                    error_type: error_type.clone(),
                    original_message: line.to_string(),
                    extracted_info,
                });
            }
        }
        None
    }
}

impl Default for ErrorDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_not_found() {
        let detector = ErrorDetector::new();
        let output = "bash: xyz: command not found";
        let error = detector.detect(output).unwrap();

        assert_eq!(error.error_type, ErrorType::CommandNotFound);
        assert_eq!(error.extracted_info, Some("xyz".to_string()));
    }

    #[test]
    fn test_permission_denied() {
        let detector = ErrorDetector::new();
        let output = "Permission denied";
        let error = detector.detect(output).unwrap();

        assert_eq!(error.error_type, ErrorType::PermissionDenied);
    }

    #[test]
    fn test_no_such_file() {
        let detector = ErrorDetector::new();
        let output = "No such file or directory";
        let error = detector.detect(output).unwrap();

        assert_eq!(error.error_type, ErrorType::NoSuchFileOrDirectory);
    }
}
