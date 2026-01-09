import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CommandContext } from '../types/llm';

interface UseLlmExplanationOptions {
  command: string;
  context: CommandContext;
  enabled?: boolean;
}

interface UseLlmExplanationResult {
  explanation: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * LLMを使ってコマンドの詳細な説明を取得するフック
 */
export function useLlmExplanation({
  command,
  context,
  enabled = true,
}: UseLlmExplanationOptions): UseLlmExplanationResult {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !command || command.trim() === '') {
      setExplanation(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCancelled = false;

    const fetchExplanation = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await invoke<string>('explain_command_with_llm', {
          command,
          context,
        });

        if (!isCancelled) {
          setExplanation(result);
          setIsLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          // プロバイダー未設定の場合はエラーとして扱わない（フォールバック）
          if (errorMessage.includes('not configured')) {
            setExplanation(null);
            setError(null);
          } else {
            console.error('Failed to get LLM explanation:', err);
            setError(errorMessage);
          }
          setIsLoading(false);
        }
      }
    };

    fetchExplanation();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, context.current_directory, context.shell_type, context.risk_level, enabled]);

  return { explanation, isLoading, error };
}
