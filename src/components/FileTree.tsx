import { useEffect, useState } from 'react';
import { Tree, NodeRendererProps } from 'react-arborist';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './FileTree.css';

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

export function FileTree({ onFileClick }: { onFileClick: (path: string, isDir: boolean) => void }) {
  const [data, setData] = useState<TreeNode[]>([]);
  const [currentDir, setCurrentDir] = useState<string>('');

  // カレントディレクトリを取得
  const loadCurrentDirectory = async () => {
    try {
      const dir = await invoke<string>('get_current_directory');
      setCurrentDir(dir);
      await loadDirectory(dir);
    } catch (error) {
      console.error('Failed to get current directory:', error);
    }
  };

  // ディレクトリの内容を読み込む
  const loadDirectory = async (path: string) => {
    try {
      const nodes = await invoke<FileNode[]>('read_directory', { path });
      const treeNodes = nodes.map((node) => convertToTreeNode(node));
      setData(treeNodes);
    } catch (error) {
      console.error('Failed to load directory:', error);
    }
  };

  // FileNodeをTreeNodeに変換
  const convertToTreeNode = (node: FileNode): TreeNode => {
    return {
      id: node.path,
      name: node.name,
      path: node.path,
      isDir: node.is_dir,
      children: node.children?.map((child) => convertToTreeNode(child)),
    };
  };

  useEffect(() => {
    loadCurrentDirectory();

    // ファイル変更イベントをリッスン
    const unlisten = listen('file-changed', () => {
      if (currentDir) {
        loadDirectory(currentDir);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [currentDir]);

  // ノードのレンダリング
  const Node = ({ node, style, dragHandle }: NodeRendererProps<TreeNode>) => {
    const handleClick = () => {
      onFileClick(node.data.path, node.data.isDir);
    };

    return (
      <div
        style={style}
        ref={dragHandle}
        className={`tree-node ${node.data.isDir ? 'directory' : 'file'}`}
        onClick={handleClick}
      >
        <span className="node-icon">{node.data.isDir ? '📁' : '📄'}</span>
        <span className="node-name">{node.data.name}</span>
      </div>
    );
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>ファイル</h3>
        <div className="current-dir">{currentDir}</div>
      </div>
      <Tree
        data={data}
        openByDefault={false}
        width="100%"
        height={600}
        indent={16}
        rowHeight={28}
      >
        {Node}
      </Tree>
    </div>
  );
}
