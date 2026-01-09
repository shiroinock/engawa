import { useState, useEffect, useCallback } from 'react';
import { Terminal } from './components/Terminal';
import { FileTree } from './components/FileTree';
import { CommandAnalyzer } from './components/CommandAnalyzer';
import { invoke } from '@tauri-apps/api/core';
import { matchFiles, expandBraces } from './utils/globMatch';
import './App.css';

interface ParseResult {
  command: string;
  args: string[];
  risk_level: 'safe' | 'caution' | 'dangerous';
  description: string;
  targets: string[];
}

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
}

function App() {
  const [currentCommand, setCurrentCommand] = useState<string>('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [currentFiles, setCurrentFiles] = useState<string[]>([]);
  const [currentDir, setCurrentDir] = useState<string>('');
  const [affectedSubdirectories, setAffectedSubdirectories] = useState<Record<string, { count: number; riskLevel: 'safe' | 'caution' | 'dangerous' }>>({});
  const [affectedParentLevels, setAffectedParentLevels] = useState<Record<number, { count: number; riskLevel: 'safe' | 'caution' | 'dangerous' }>>({});
  const [resolvedTargets, setResolvedTargets] = useState<string[]>([]);

  // カレントディレクトリのファイル一覧を取得
  const loadCurrentFiles = useCallback(async () => {
    try {
      const dir = await invoke<string>('get_current_directory');
      setCurrentDir(dir);
      const nodes = await invoke<FileNode[]>('read_directory', { path: dir });
      const fileNames = nodes.map(node => node.name);
      setCurrentFiles(fileNames);
    } catch (error) {
      console.error('Failed to load current files:', error);
      setCurrentDir('');
      setCurrentFiles([]);
    }
  }, []);

  // ディレクトリ更新イベントをリッスン
  useEffect(() => {
    const handleCommandExecuted = () => {
      loadCurrentFiles();
    };
    window.addEventListener('engawa-command-executed', handleCommandExecuted);
    return () => {
      window.removeEventListener('engawa-command-executed', handleCommandExecuted);
    };
  }, [loadCurrentFiles]);

  // パース結果とファイル一覧からハイライト情報を生成
  const highlightedFiles = parseResult && parseResult.targets.length > 0
    ? parseResult.targets.flatMap(pattern => {
        const matched = matchFiles(pattern, currentFiles);
        return matched.map(fileName => ({
          name: fileName,
          riskLevel: parseResult.risk_level,
        }));
      })
    : [];

  // サブディレクトリと親ディレクトリの実際のファイル数をカウント
  useEffect(() => {
    const calculateAffectedCounts = async () => {
      if (!parseResult || parseResult.targets.length === 0 || !currentDir) {
        setAffectedSubdirectories({});
        setAffectedParentLevels({});
        setResolvedTargets([]);
        return;
      }

      const subdirs: Record<string, { count: number; riskLevel: 'safe' | 'caution' | 'dangerous' }> = {};
      const parents: Record<number, { count: number; riskLevel: 'safe' | 'caution' | 'dangerous' }> = {};
      const allResolvedFiles: string[] = [];

      for (const originalTarget of parseResult.targets) {
        // ブレース展開を適用
        const expandedTargets = expandBraces(originalTarget);

        for (const target of expandedTargets) {
        // カレントディレクトリのファイル（パスに / が含まれない、または絶対パスでも親パスでもない）
        if (!target.includes('/') || (!target.startsWith('../') && !target.startsWith('/'))) {
          if (!target.includes('/')) {
            // カレントディレクトリ直下のパターン
            const matched = matchFiles(target, currentFiles);
            allResolvedFiles.push(...matched);
          }
        }

        // サブディレクトリのパターン
        if (target.includes('/') && !target.startsWith('../') && !target.startsWith('/')) {
          const parts = target.split('/');
          const firstDir = parts[0];

          // 残りのパスとパターンを分離（subdir/sub2/*.txt の場合）
          const remainingPath = parts.slice(1);

          if (remainingPath.length > 1) {
            // さらに深い階層がある場合（subdir/sub2/*.txt など）
            const subdirs2 = remainingPath.slice(0, -1); // ['sub2']
            const pattern = remainingPath[remainingPath.length - 1]; // '*.txt'

            const targetPath = `${currentDir}/${firstDir}/${subdirs2.join('/')}`;

            try {
              const nodes = await invoke<FileNode[]>('read_directory', { path: targetPath });
              const fileNames = nodes.map(node => node.name);
              const matched = matchFiles(pattern, fileNames);

              if (!subdirs[firstDir]) {
                subdirs[firstDir] = {
                  count: 0,
                  riskLevel: parseResult.risk_level,
                };
              }
              subdirs[firstDir].count += matched.length;

              // 解決されたファイル名を追加（相対パス付き）
              const fullPrefix = `${firstDir}/${subdirs2.join('/')}/`;
              allResolvedFiles.push(...matched.map(f => `${fullPrefix}${f}`));
            } catch (error) {
              // ディレクトリが読めない場合は元のパターンを追加
              if (!subdirs[firstDir]) {
                subdirs[firstDir] = {
                  count: 1,
                  riskLevel: parseResult.risk_level,
                };
              }
              allResolvedFiles.push(target);
            }
          } else {
            // 1階層のみの場合（subdir/*.txt など）
            const pattern = remainingPath.join('/');

            try {
              const subdirPath = `${currentDir}/${firstDir}`;
              const nodes = await invoke<FileNode[]>('read_directory', { path: subdirPath });
              const fileNames = nodes.map(node => node.name);
              const matched = matchFiles(pattern, fileNames);

              if (!subdirs[firstDir]) {
                subdirs[firstDir] = {
                  count: 0,
                  riskLevel: parseResult.risk_level,
                };
              }
              subdirs[firstDir].count += matched.length;

              // 解決されたファイル名を追加（相対パス付き）
              allResolvedFiles.push(...matched.map(f => `${firstDir}/${f}`));
            } catch (error) {
              // ディレクトリが読めない場合は元のパターンを追加
              if (!subdirs[firstDir]) {
                subdirs[firstDir] = {
                  count: 1,
                  riskLevel: parseResult.risk_level,
                };
              }
              allResolvedFiles.push(target);
            }
          }
        }

        // 親ディレクトリのパターン
        if (target.startsWith('../')) {
          const parts = target.split('/');
          let level = 0;
          let pathIndex = 0;

          // ../ の数をカウント
          for (const part of parts) {
            if (part === '..') {
              level++;
              pathIndex++;
            } else {
              break;
            }
          }

          // 残りのパス（sub/pattern など）
          const remainingPath = parts.slice(pathIndex);

          // 親ディレクトリのパスを計算
          const currentParts = currentDir.split('/').filter(Boolean);
          if (currentParts.length >= level) {
            const parentPath = '/' + currentParts.slice(0, currentParts.length - level).join('/');

            // remainingPath がさらにディレクトリを含む場合（['sub', '*.txt'] など）
            if (remainingPath.length > 1) {
              const subdirs = remainingPath.slice(0, -1); // ['sub']
              const pattern = remainingPath[remainingPath.length - 1]; // '*.txt'

              const targetPath = parentPath + '/' + subdirs.join('/');

              try {
                const nodes = await invoke<FileNode[]>('read_directory', { path: targetPath });
                const fileNames = nodes.map(node => node.name);
                const matched = matchFiles(pattern, fileNames);

                // 親ディレクトリレベルのカウントに追加
                if (!parents[level]) {
                  parents[level] = {
                    count: 0,
                    riskLevel: parseResult.risk_level,
                  };
                }
                parents[level].count += matched.length;

                // 解決されたファイル名を追加（相対パス付き）
                const prefix = '../'.repeat(level) + subdirs.join('/') + '/';
                allResolvedFiles.push(...matched.map(f => `${prefix}${f}`));
              } catch (error) {
                // ディレクトリが読めない場合は元のパターンを追加
                if (!parents[level]) {
                  parents[level] = {
                    count: 1,
                    riskLevel: parseResult.risk_level,
                  };
                }
                allResolvedFiles.push(target);
              }
            } else {
              // ディレクトリを含まない場合（../*.txt など）
              const pattern = remainingPath.join('/');

              try {
                const nodes = await invoke<FileNode[]>('read_directory', { path: parentPath });
                const fileNames = nodes.map(node => node.name);
                const matched = matchFiles(pattern, fileNames);

                if (!parents[level]) {
                  parents[level] = {
                    count: 0,
                    riskLevel: parseResult.risk_level,
                  };
                }
                parents[level].count += matched.length;

                // 解決されたファイル名を追加（相対パス付き）
                const prefix = '../'.repeat(level);
                allResolvedFiles.push(...matched.map(f => `${prefix}${f}`));
              } catch (error) {
                // ディレクトリが読めない場合は元のパターンを追加
                if (!parents[level]) {
                  parents[level] = {
                    count: 1,
                    riskLevel: parseResult.risk_level,
                  };
                }
                allResolvedFiles.push(target);
              }
            }
          }
        }

        // 絶対パスの場合はそのまま追加
        if (target.startsWith('/')) {
          allResolvedFiles.push(target);
        }
        }
      }

      setAffectedSubdirectories(subdirs);
      setAffectedParentLevels(parents);
      setResolvedTargets(allResolvedFiles);
    };

    calculateAffectedCounts();
  }, [parseResult, currentDir, currentFiles]);

  const handleFileClick = async (path: string, isDir: boolean) => {
    if (isDir) {
      // ディレクトリの場合は cd コマンドを実行（相対パス）
      // ファイルツリーに表示されるのはカレントディレクトリ直下なので、
      // ディレクトリ名だけを取り出す
      const dirName = path.split('/').pop() || '';
      // スペースを含む場合のみ引用符で囲む
      const escapedName = dirName.includes(' ') ? `"${dirName}"` : dirName;
      try {
        await invoke('write_to_pty', { data: `cd ${escapedName}\n` });
        // コマンド実行後にディレクトリ更新イベントを発火
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('engawa-command-executed'));
        }, 100);
      } catch (error) {
        console.error('Failed to change directory:', error);
      }
    } else {
      // ファイルの場合はファイル名だけを挿入（相対パス）
      const fileName = path.split('/').pop() || '';
      // スペースを含む場合のみ引用符で囲む
      const escapedName = fileName.includes(' ') ? `"${fileName}"` : fileName;
      try {
        await invoke('write_to_pty', { data: `${escapedName} ` });
      } catch (error) {
        console.error('Failed to insert path:', error);
      }
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <FileTree
          onFileClick={handleFileClick}
          highlightedFiles={highlightedFiles}
          affectedSubdirectories={affectedSubdirectories}
          affectedParentLevels={affectedParentLevels}
        />
      </div>
      <div className="main-content">
        <Terminal onCurrentCommandChange={setCurrentCommand} />
        <CommandAnalyzer
          currentCommand={currentCommand}
          onParseResult={setParseResult}
          resolvedTargets={resolvedTargets}
        />
      </div>
    </div>
  );
}

export default App;
