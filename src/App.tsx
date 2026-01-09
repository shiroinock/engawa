import { useState } from 'react';
import { Terminal } from './components/Terminal';
import { FileTree } from './components/FileTree';
import { CommandAnalyzer } from './components/CommandAnalyzer';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

function App() {
  const [currentCommand, setCurrentCommand] = useState<string>('');

  const handleFileClick = async (path: string, isDir: boolean) => {
    if (isDir) {
      // ディレクトリの場合は cd コマンドを実行
      try {
        await invoke('write_to_pty', { data: `cd "${path}"\n` });
        // コマンド実行後にディレクトリ更新イベントを発火
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('engawa-command-executed'));
        }, 100);
      } catch (error) {
        console.error('Failed to change directory:', error);
      }
    } else {
      // ファイルの場合はパスを挿入
      try {
        await invoke('write_to_pty', { data: `"${path}" ` });
      } catch (error) {
        console.error('Failed to insert path:', error);
      }
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <FileTree onFileClick={handleFileClick} />
      </div>
      <div className="main-content">
        <Terminal onCurrentCommandChange={setCurrentCommand} />
        <CommandAnalyzer currentCommand={currentCommand} />
      </div>
    </div>
  );
}

export default App;
