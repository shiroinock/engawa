import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './ErrorTranslation.css';

interface ErrorTranslationProps {
  errorMessage: string | null;
  onDismiss: () => void;
}

export function ErrorTranslation({ errorMessage, onDismiss }: ErrorTranslationProps) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!errorMessage) {
      setTranslation(null);
      setError(null);
      return;
    }

    const translateError = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const context = {
          current_directory: await invoke<string>('get_current_directory'),
          shell_type: 'zsh', // TODO: 実際のシェル種別を取得
          risk_level: 'safe',
        };

        const result = await invoke<string>('translate_error_message', {
          errorMessage,
          context,
        });

        setTranslation(result);
      } catch (err) {
        console.error('Failed to translate error:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);

        if (errorMsg.includes('not configured')) {
          setError('LLMプロバイダーが設定されていません');
        } else {
          setError('エラー翻訳に失敗しました');
        }
      } finally {
        setIsLoading(false);
      }
    };

    translateError();
  }, [errorMessage]);

  if (!errorMessage && !translation) {
    return null;
  }

  return (
    <div className="error-translation">
      <div className="error-translation-content">
        <div className="error-translation-header">
          <h4>💬 エラーの説明</h4>
          <button className="dismiss-button" onClick={onDismiss} title="閉じる">
            ✕
          </button>
        </div>

        {isLoading && (
          <div className="error-translation-loading">
            読み込み中...
          </div>
        )}

        {error && (
          <div className="error-translation-error">
            {error}
          </div>
        )}

        {translation && !isLoading && (
          <div className="error-translation-text">
            {translation.split('\n').map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        )}

        <div className="error-translation-original">
          <details>
            <summary>元のエラーメッセージ</summary>
            <pre>{errorMessage}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}
