import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './CommandAnalyzer.css';

interface ParseResult {
  command: string;
  args: string[];
  risk_level: 'safe' | 'caution' | 'dangerous';
  description: string;
}

export function CommandAnalyzer({ currentCommand }: { currentCommand: string }) {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  useEffect(() => {
    const parseCommand = async () => {
      if (!currentCommand || currentCommand.trim() === '') {
        setParseResult(null);
        return;
      }

      try {
        const result = await invoke<ParseResult | null>('parse_command', {
          input: currentCommand,
        });
        setParseResult(result);
      } catch (error) {
        console.error('Failed to parse command:', error);
        setParseResult(null);
      }
    };

    // デバウンス処理（300ms）
    const timeoutId = setTimeout(() => {
      parseCommand();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [currentCommand]);

  // コマンドがない時のデフォルト表示
  if (!parseResult) {
    return (
      <div className="command-analyzer">
        <div className="analyzer-content">
          <div className="placeholder-text">コマンドを入力すると、ここに説明が表示されます</div>
        </div>
      </div>
    );
  }

  const riskLevelClass = `risk-${parseResult.risk_level}`;
  const riskLevelText = {
    safe: '安全',
    caution: '注意',
    dangerous: '危険',
  }[parseResult.risk_level];

  return (
    <div className={`command-analyzer ${riskLevelClass}`}>
      <div className="analyzer-content">
        <div className="risk-indicator">
          <span className="risk-icon">
            {parseResult.risk_level === 'safe' && '✓'}
            {parseResult.risk_level === 'caution' && '⚠'}
            {parseResult.risk_level === 'dangerous' && '⚠'}
          </span>
          <span className="risk-level">{riskLevelText}</span>
        </div>
        <div className="command-info">
          <span className="command-name">{parseResult.command}</span>
          {parseResult.args.length > 0 && (
            <span className="command-args">{parseResult.args.join(' ')}</span>
          )}
        </div>
        <div className="command-description">{parseResult.description}</div>
      </div>
    </div>
  );
}
