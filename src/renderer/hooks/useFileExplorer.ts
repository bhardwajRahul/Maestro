import { useState, useEffect, useMemo, useRef } from 'react';
import type { Session } from '../types';
import { fuzzyMatch } from '../utils/search';
import {
  shouldOpenExternally,
  flattenTree as flattenTreeUtil,
  getAllFolderPaths as getAllFolderPathsUtil,
  type FileTreeNode,
} from '../utils/fileExplorer';

export interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  fullPath?: string;
  isFolder?: boolean;
}

export interface UseFileExplorerReturn {
  // State
  previewFile: {name: string; content: string; path: string} | null;
  setPreviewFile: (file: {name: string; content: string; path: string} | null) => void;
  selectedFileIndex: number;
  setSelectedFileIndex: (index: number) => void;
  flatFileList: any[];
  fileTreeFilter: string;
  setFileTreeFilter: (filter: string) => void;
  fileTreeFilterOpen: boolean;
  setFileTreeFilterOpen: (open: boolean) => void;
  fileTreeContainerRef: React.RefObject<HTMLDivElement>;

  // Operations
  handleFileClick: (node: any, path: string, activeSession: Session) => Promise<void>;
  loadFileTree: (dirPath: string, maxDepth?: number, currentDepth?: number) => Promise<any[]>;
  updateSessionWorkingDirectory: (activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => Promise<void>;
  toggleFolder: (path: string, activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  expandAllFolders: (activeSessionId: string, activeSession: Session, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  collapseAllFolders: (activeSessionId: string, setSessions: React.Dispatch<React.SetStateAction<Session[]>>) => void;
  flattenTree: (nodes: any[], expandedSet: Set<string>, currentPath?: string) => any[];
  filteredFileTree: any[];
  shouldOpenExternally: (filename: string) => boolean;
}

export function useFileExplorer(
  activeSession: Session | null,
  setActiveFocus: (focus: string) => void
): UseFileExplorerReturn {
  const [previewFile, setPreviewFile] = useState<{name: string; content: string; path: string} | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [flatFileList, setFlatFileList] = useState<any[]>([]);
  const [fileTreeFilter, setFileTreeFilter] = useState('');
  const [fileTreeFilterOpen, setFileTreeFilterOpen] = useState(false);
  const fileTreeContainerRef = useRef<HTMLDivElement>(null);

  const handleFileClick = async (node: any, path: string, activeSession: Session) => {
    if (node.type === 'file') {
      try {
        // Construct full file path
        const fullPath = `${activeSession.fullPath}/${path}`;

        // Check if file should be opened externally
        if (shouldOpenExternally(node.name)) {
          await window.maestro.shell.openExternal(`file://${fullPath}`);
          return;
        }

        const content = await window.maestro.fs.readFile(fullPath);
        setPreviewFile({
          name: node.name,
          content: content,
          path: fullPath
        });
        setActiveFocus('main');
      } catch (error) {
        console.error('Failed to read file:', error);
      }
    }
  };

  // Load file tree from directory
  const loadFileTree = async (dirPath: string, maxDepth = 10, currentDepth = 0): Promise<any[]> => {
    if (currentDepth >= maxDepth) return [];

    try {
      const entries = await window.maestro.fs.readDir(dirPath);
      const tree: any[] = [];

      for (const entry of entries) {
        // Skip hidden files and common ignore patterns
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') {
          continue;
        }

        if (entry.isDirectory) {
          const children = await loadFileTree(`${dirPath}/${entry.name}`, maxDepth, currentDepth + 1);
          tree.push({
            name: entry.name,
            type: 'folder',
            children
          });
        } else if (entry.isFile) {
          tree.push({
            name: entry.name,
            type: 'file'
          });
        }
      }

      return tree.sort((a, b) => {
        // Folders first, then alphabetically
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Error loading file tree:', error);
      throw error;
    }
  };

  const updateSessionWorkingDirectory = async (
    activeSessionId: string,
    setSessions: React.Dispatch<React.SetStateAction<Session[]>>
  ) => {
    const newPath = await window.maestro.dialog.selectFolder();
    if (!newPath) return;

    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      return {
        ...s,
        cwd: newPath,
        fullPath: newPath,
        fileTree: [],
        fileTreeError: undefined
      };
    }));
  };

  const toggleFolder = (
    path: string,
    activeSessionId: string,
    setSessions: React.Dispatch<React.SetStateAction<Session[]>>
  ) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      if (!s.fileExplorerExpanded) return s;
      const expanded = new Set(s.fileExplorerExpanded);
      if (expanded.has(path)) {
        expanded.delete(path);
      } else {
        expanded.add(path);
      }
      return { ...s, fileExplorerExpanded: Array.from(expanded) };
    }));
  };

  const expandAllFolders = (
    activeSessionId: string,
    activeSession: Session,
    setSessions: React.Dispatch<React.SetStateAction<Session[]>>
  ) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      if (!s.fileTree) return s;
      const allFolderPaths = getAllFolderPathsUtil(s.fileTree as FileTreeNode[]);
      return { ...s, fileExplorerExpanded: allFolderPaths };
    }));
  };

  const collapseAllFolders = (
    activeSessionId: string,
    setSessions: React.Dispatch<React.SetStateAction<Session[]>>
  ) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      return { ...s, fileExplorerExpanded: [] };
    }));
  };

  // Update flat file list when active session's tree or expanded folders change
  useEffect(() => {
    if (!activeSession || !activeSession.fileTree || !activeSession.fileExplorerExpanded) {
      setFlatFileList([]);
      return;
    }
    const expandedSet = new Set(activeSession.fileExplorerExpanded);
    setFlatFileList(flattenTreeUtil(activeSession.fileTree as FileTreeNode[], expandedSet));
  }, [activeSession?.fileTree, activeSession?.fileExplorerExpanded]);

  // Filter file tree based on search query
  const filteredFileTree = useMemo(() => {
    if (!activeSession || !fileTreeFilter || !activeSession.fileTree) {
      return activeSession?.fileTree || [];
    }

    const filterTree = (nodes: any[]): any[] => {
      return nodes.reduce((acc: any[], node) => {
        const matchesFilter = fuzzyMatch(node.name, fileTreeFilter);

        if (node.type === 'folder' && node.children) {
          const filteredChildren = filterTree(node.children);
          // Include folder if it matches or has matching children
          if (matchesFilter || filteredChildren.length > 0) {
            acc.push({
              ...node,
              children: filteredChildren
            });
          }
        } else if (matchesFilter) {
          // Include file if it matches
          acc.push(node);
        }

        return acc;
      }, []);
    };

    return filterTree(activeSession.fileTree);
  }, [activeSession?.fileTree, fileTreeFilter]);

  return {
    previewFile,
    setPreviewFile,
    selectedFileIndex,
    setSelectedFileIndex,
    flatFileList,
    fileTreeFilter,
    setFileTreeFilter,
    fileTreeFilterOpen,
    setFileTreeFilterOpen,
    fileTreeContainerRef,
    handleFileClick,
    loadFileTree,
    updateSessionWorkingDirectory,
    toggleFolder,
    expandAllFolders,
    collapseAllFolders,
    flattenTree: flattenTreeUtil,
    filteredFileTree,
    shouldOpenExternally,
  };
}
