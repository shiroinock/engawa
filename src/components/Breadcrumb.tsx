import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './Breadcrumb.css';

export function Breadcrumb() {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [pathSegments, setPathSegments] = useState<string[]>([]);
  const previousPathRef = useRef<string>('');

  useEffect(() => {
    const updateCurrentDirectory = async () => {
      try {
        const path = await invoke<string>('get_current_directory');
        // パスが実際に変わった時だけ更新
        if (path !== previousPathRef.current) {
          previousPathRef.current = path;
          setCurrentPath(path);

          // パスをセグメントに分割
          const segments = path.split('/').filter(Boolean);
          setPathSegments(segments);
        }
      } catch (error) {
        console.error('Failed to get current directory:', error);
      }
    };

    // 初回読み込みはスキップ（PTY作成後のイベントを待つ）

    // コマンド実行イベントをリッスン
    const handleCommandExecuted = () => {
      updateCurrentDirectory();
    };
    window.addEventListener('engawa-command-executed', handleCommandExecuted);

    return () => {
      window.removeEventListener('engawa-command-executed', handleCommandExecuted);
    };
  }, []);

  const handleOpenInFinder = async () => {
    try {
      await invoke('open_in_finder', { path: currentPath });
    } catch (error) {
      console.error('Failed to open in Finder:', error);
    }
  };

  const handleSegmentClick = async (index: number) => {
    // 親ディレクトリへの移動は相対パスで
    const levelsUp = pathSegments.length - index - 1;
    const relativePath = '../'.repeat(levelsUp).slice(0, -1); // 最後の/を削除

    try {
      // cdコマンドを実行（相対パス）
      await invoke('write_to_pty', { data: `cd ${relativePath}\n` });
      // コマンド実行後にディレクトリ更新イベントを発火
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('engawa-command-executed'));
      }, 100);
    } catch (error) {
      console.error('Failed to change directory:', error);
    }
  };

  const handleRootClick = async () => {
    try {
      await invoke('write_to_pty', { data: 'cd /\n' });
      // コマンド実行後にディレクトリ更新イベントを発火
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('engawa-command-executed'));
      }, 100);
    } catch (error) {
      console.error('Failed to change directory:', error);
    }
  };

  return (
    <div className="breadcrumb">
      <div className="breadcrumb-header">
        <span className="breadcrumb-root" onClick={handleRootClick}>
          /
        </span>
        <button className="finder-button" onClick={handleOpenInFinder} title="Finderで開く">
          📁
        </button>
      </div>
      <div className="breadcrumb-path">
        {pathSegments.map((segment, index) => {
          const isCurrentDir = index === pathSegments.length - 1;
          return (
            <span
              key={index}
              className="breadcrumb-segment"
              style={{ paddingLeft: `${(index + 1) * 12}px` }}
            >
              <span
                className={`breadcrumb-item ${isCurrentDir ? 'current' : ''}`}
                onClick={isCurrentDir ? undefined : () => handleSegmentClick(index)}
              >
                {segment}
              </span>
              {index < pathSegments.length - 1 && (
                <span className="breadcrumb-separator">/</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
