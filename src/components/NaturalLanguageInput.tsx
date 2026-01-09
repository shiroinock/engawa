import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './NaturalLanguageInput.css';

interface NaturalLanguageInputProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCommand: (command: string) => void;
}

export function NaturalLanguageInput({
  isOpen,
  onClose,
  onInsertCommand,
}: NaturalLanguageInputProps) {
  const [input, setInput] = useState<string>('');
  const [translatedCommand, setTranslatedCommand] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // モーダルが開いたらフォーカス
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

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
    if (isOpen) {
      getCurrentDir();
    }
  }, [isOpen]);

  // Escapeキーで閉じる
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleClose = () => {
    setInput('');
    setTranslatedCommand('');
    setError(null);
    onClose();
  };

  const handleTranslate = async () => {
    if (!input.trim()) {
      setError('指示を入力してください');
      return;
    }

    setIsTranslating(true);
    setError(null);
    setTranslatedCommand('');

    try {
      const context = {
        current_directory: currentDir,
        shell_type: 'zsh', // TODO: 実際のシェル種別を取得
        risk_level: 'safe',
      };

      const command = await invoke<string>('translate_natural_language_to_command', {
        input: input.trim(),
        context,
      });

      setTranslatedCommand(command.trim());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('not configured')) {
        setError('LLMプロバイダーが設定されていません。設定画面からAPIキーを登録してください。');
      } else {
        console.error('Failed to translate:', err);
        setError(`変換に失敗しました: ${errorMessage}`);
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const handleInsert = () => {
    if (translatedCommand) {
      onInsertCommand(translatedCommand);
      handleClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="natural-language-overlay" onClick={handleClose}>
      <div className="natural-language-modal" onClick={(e) => e.stopPropagation()}>
        <div className="natural-language-header">
          <h3>自然言語でコマンド入力</h3>
          <button className="close-button" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="natural-language-body">
          <div className="input-section">
            <label htmlFor="natural-input">やりたいことを日本語で入力</label>
            <textarea
              ref={textareaRef}
              id="natural-input"
              className="natural-input-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例: 今日変更したファイルを表示&#10;例: JSファイルを一覧表示&#10;例: package.jsonの内容を見る"
              rows={4}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleTranslate();
                }
              }}
            />
          </div>

          <div className="button-group">
            <button
              className="btn-translate"
              onClick={handleTranslate}
              disabled={isTranslating || !input.trim()}
            >
              {isTranslating ? '変換中...' : '変換 (⌘/Ctrl+Enter)'}
            </button>
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          {translatedCommand && (
            <div className="result-section">
              <label>変換結果</label>
              <div className="command-preview">
                <code>{translatedCommand}</code>
              </div>
              <div className="result-actions">
                <button className="btn-insert" onClick={handleInsert}>
                  ターミナルに挿入
                </button>
                <button className="btn-copy" onClick={() => {
                  navigator.clipboard.writeText(translatedCommand);
                }}>
                  コピー
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="natural-language-footer">
          <p className="hint-text">
            💡 ヒント: Cmd/Ctrl+K で開く・閉じる、Esc で閉じる
          </p>
        </div>
      </div>
    </div>
  );
}
