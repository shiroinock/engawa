import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLlmExplanation } from '../hooks/useLlm';
import './PreviewModal.css';

interface ParseResult {
  command: string;
  args: string[];
  risk_level: 'safe' | 'caution' | 'dangerous';
  description: string;
}

interface PreviewModalProps {
  command: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PreviewModal({ command, onConfirm, onCancel }: PreviewModalProps) {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [enterKeyReleased, setEnterKeyReleased] = useState(false);
  const [currentDir, setCurrentDir] = useState<string>('');

  // カレントディレクトリを取得
  useEffect(() => {
    const getCurrentDir = async () => {
      try {
        const dir = await invoke<string>('get_current_directory');
        setCurrentDir(dir);
      } catch (error) {
        console.error('Failed to get current directory:', error);
      }
    };
    getCurrentDir();
  }, []);

  // コンテキストをメモ化（無限ループ防止）
  const context = useMemo(() => ({
    current_directory: currentDir,
    shell_type: 'zsh', // TODO: 実際のシェル種別を取得
    risk_level: parseResult?.risk_level || 'safe',
  }), [currentDir, parseResult?.risk_level]);

  // LLM説明を取得
  const { explanation: llmExplanation, isLoading: isLoadingLlm } = useLlmExplanation({
    command,
    context,
    enabled: !!parseResult && !!currentDir,
  });

  useEffect(() => {
    const parseCommand = async () => {
      try {
        const result = await invoke<ParseResult | null>('parse_command', {
          input: command,
        });
        setParseResult(result);
      } catch (error) {
        console.error('Failed to parse command:', error);
        setParseResult(null);
      }
    };

    parseCommand();
  }, [command]);

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      } else if (event.key === 'Enter') {
        // Enterキーが一度離されるまで無視（長押しから開いた場合の対策）
        if (!enterKeyReleased) {
          setEnterKeyReleased(true);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [onConfirm, onCancel, enterKeyReleased]);

  if (!parseResult) {
    return null;
  }

  const riskLevelClass = `risk-${parseResult.risk_level}`;
  const riskLevelText = {
    safe: '安全',
    caution: '注意',
    dangerous: '危険',
  }[parseResult.risk_level];

  const isReversible = parseResult.command !== 'rm' && !parseResult.args.includes('-rf');
  const isDangerous = parseResult.risk_level === 'dangerous';

  return (
    <div className="preview-modal-overlay" onClick={onCancel}>
      <div className={`preview-modal ${riskLevelClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <div className="risk-badge">
            <span className="risk-icon">
              {parseResult.risk_level === 'safe' && '✓'}
              {parseResult.risk_level === 'caution' && '⚠'}
              {parseResult.risk_level === 'dangerous' && '⚠'}
            </span>
            <span className="risk-text">{riskLevelText}</span>
          </div>
          <h3>コマンド実行前の確認</h3>
        </div>

        <div className="preview-body">
          <div className="command-display">
            <code>{command}</code>
          </div>

          <div className="command-explanation">
            <h4>このコマンドは...</h4>
            <p>{parseResult.description}</p>
          </div>

          {/* LLM詳細説明 */}
          {(llmExplanation || isLoadingLlm) && (
            <div className="llm-explanation">
              <h4>詳しい説明 <span className="ai-badge">Powered by AI</span></h4>
              {isLoadingLlm ? (
                <div className="llm-loading">
                  <div className="loading-spinner"></div>
                  <span>AI が説明を生成中...</span>
                </div>
              ) : (
                <p>{llmExplanation}</p>
              )}
            </div>
          )}

          <div className="impact-info">
            <h4>影響範囲</h4>
            <ul>
              <li>
                <strong>対象:</strong>{' '}
                {parseResult.args.length > 0
                  ? parseResult.args.join(', ')
                  : 'カレントディレクトリ'}
              </li>
              {!isReversible && (
                <li className="warning-text">
                  ⚠️ <strong>この操作は取り消せません</strong>
                </li>
              )}
              {isReversible && (
                <li className="info-text">
                  ℹ️ この操作は元に戻すことができます
                </li>
              )}
            </ul>
          </div>

          {isDangerous && (
            <div className="danger-warning">
              <p>⚠️ 危険なコマンドです。本当に実行しますか？</p>
            </div>
          )}
        </div>

        <div className="preview-footer">
          <button className="btn-cancel" onClick={onCancel}>
            キャンセル (Esc)
          </button>
          <button
            className={`btn-confirm ${isDangerous ? 'btn-danger' : ''}`}
            onClick={onConfirm}
          >
            実行 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
