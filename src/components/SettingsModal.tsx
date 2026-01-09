import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LlmConfig, LlmProviderType } from '../types/llm';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CostInfo {
  daily_cost: number;
  monthly_cost: number;
  daily_limit: number | null;
  monthly_limit: number | null;
  enabled: boolean;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<LlmProviderType>('OpenAi');
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('gpt-4o-mini');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  // コスト管理
  const [costInfo, setCostInfo] = useState<CostInfo | null>(null);
  const [costEnabled, setCostEnabled] = useState<boolean>(true);
  const [dailyLimit, setDailyLimit] = useState<string>('0.50');
  const [monthlyLimit, setMonthlyLimit] = useState<string>('5.00');

  useEffect(() => {
    if (!isOpen) return;

    // 設定を読み込む（ローカルストレージから）
    const savedConfig = localStorage.getItem('llm_config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig) as LlmConfig;
        setProvider(config.provider);
        setApiKey(config.api_key);
        setModel(config.model);
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    }

    // コスト情報を読み込む
    const loadCostInfo = async () => {
      try {
        const info = await invoke<CostInfo>('get_cost_info');
        setCostInfo(info);
        setCostEnabled(info.enabled);
        if (info.daily_limit !== null) {
          setDailyLimit(info.daily_limit.toFixed(2));
        }
        if (info.monthly_limit !== null) {
          setMonthlyLimit(info.monthly_limit.toFixed(2));
        }
      } catch (error) {
        console.error('Failed to load cost info:', error);
      }
    };
    loadCostInfo();
  }, [isOpen]);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setSaveMessage('APIキーを入力してください');
      return;
    }

    setIsSaving(true);
    setSaveMessage('');

    const config: LlmConfig = {
      provider,
      api_key: apiKey,
      model,
      timeout_seconds: 30,
      cache_enabled: true,
    };

    try {
      // Tauriコマンドでプロバイダーを設定
      await invoke('configure_llm_provider', { config });

      // ローカルストレージに保存（APIキーは含める - 注意: 本番環境では暗号化を検討）
      localStorage.setItem('llm_config', JSON.stringify(config));

      // コスト設定を保存
      const costSettings = {
        daily_limit: dailyLimit ? parseFloat(dailyLimit) : null,
        monthly_limit: monthlyLimit ? parseFloat(monthlyLimit) : null,
        enabled: costEnabled,
      };
      await invoke('update_cost_settings', { settings: costSettings });

      setSaveMessage('設定を保存しました');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Failed to save config:', error);
      setSaveMessage(`エラー: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      handleSave();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="settings-header">
          <h3>LLM設定</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-field">
            <label htmlFor="provider">プロバイダー</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as LlmProviderType)}
            >
              <option value="OpenAi">OpenAI</option>
              <option value="Anthropic" disabled>
                Anthropic (準備中)
              </option>
            </select>
          </div>

          <div className="settings-field">
            <label htmlFor="model">モデル</label>
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例: gpt-4o-mini"
            />
            <span className="field-hint">
              {provider === 'OpenAi' ? '例: gpt-4o-mini, gpt-4o' : '例: claude-3-5-sonnet-20241022'}
            </span>
          </div>

          <div className="settings-field">
            <label htmlFor="apiKey">APIキー</label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <span className="field-hint">
              {provider === 'OpenAi' && (
                <>
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                    OpenAI APIキーを取得
                  </a>
                </>
              )}
            </span>
          </div>

          <hr className="settings-divider" />

          <h4 className="settings-section-title">コスト管理</h4>

          {costInfo && (
            <div className="cost-info-display">
              <div className="cost-stat">
                <span className="cost-label">今日の使用額:</span>
                <span className="cost-value">${costInfo.daily_cost.toFixed(4)}</span>
                {costInfo.daily_limit !== null && (
                  <span className="cost-limit">/ ${costInfo.daily_limit.toFixed(2)}</span>
                )}
              </div>
              <div className="cost-stat">
                <span className="cost-label">今月の使用額:</span>
                <span className="cost-value">${costInfo.monthly_cost.toFixed(4)}</span>
                {costInfo.monthly_limit !== null && (
                  <span className="cost-limit">/ ${costInfo.monthly_limit.toFixed(2)}</span>
                )}
              </div>
            </div>
          )}

          <div className="settings-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={costEnabled}
                onChange={(e) => setCostEnabled(e.target.checked)}
              />
              コスト管理を有効にする
            </label>
            <span className="field-hint">
              予算上限を超えるとLLM機能の使用を制限します
            </span>
          </div>

          <div className="settings-field">
            <label htmlFor="dailyLimit">日間予算上限（ドル）</label>
            <input
              id="dailyLimit"
              type="number"
              step="0.01"
              min="0"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              placeholder="0.50"
              disabled={!costEnabled}
            />
            <span className="field-hint">
              1日あたりのLLM使用予算上限（デフォルト: $0.50）
            </span>
          </div>

          <div className="settings-field">
            <label htmlFor="monthlyLimit">月間予算上限（ドル）</label>
            <input
              id="monthlyLimit"
              type="number"
              step="0.01"
              min="0"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
              placeholder="5.00"
              disabled={!costEnabled}
            />
            <span className="field-hint">
              1ヶ月あたりのLLM使用予算上限（デフォルト: $5.00）
            </span>
          </div>

          {saveMessage && (
            <div className={`save-message ${saveMessage.includes('エラー') ? 'error' : 'success'}`}>
              {saveMessage}
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="btn-secondary" onClick={onClose}>
            キャンセル (Esc)
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '保存中...' : '保存 (⌘Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
}
