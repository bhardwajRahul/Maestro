import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, File, Folder } from 'lucide-react';
import type { Theme, Shortcut } from '../types';
import { fuzzyMatchWithScore } from '../utils/search';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { formatShortcutKeys } from '../utils/shortcutFormatter';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

/** Flattened file item for the search list */
export interface FlatFileItem {
  name: string;
  fullPath: string;
  isFolder: boolean;
  depth: number;
}

interface FileSearchModalProps {
  theme: Theme;
  fileTree: FileNode[];
  shortcut?: Shortcut;
  onFileSelect: (item: FlatFileItem) => void;
  onClose: () => void;
}

/**
 * Recursively flatten the entire file tree (ignoring expansion state).
 * Returns all files and folders with their full paths.
 */
function flattenEntireTree(nodes: FileNode[], currentPath = '', depth = 0): FlatFileItem[] {
  const result: FlatFileItem[] = [];

  for (const node of nodes) {
    const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
    result.push({
      name: node.name,
      fullPath,
      isFolder: node.type === 'folder',
      depth,
    });

    if (node.type === 'folder' && node.children) {
      result.push(...flattenEntireTree(node.children, fullPath, depth + 1));
    }
  }

  return result;
}

/**
 * Fuzzy File Search Modal - Quick navigation to any file in the file tree.
 * Supports fuzzy search, arrow key navigation, and Cmd+1-9,0 quick select.
 */
export function FileSearchModal({
  theme,
  fileTree,
  shortcut,
  onFileSelect,
  onClose
}: FileSearchModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const layerIdRef = useRef<string>();
  const onCloseRef = useRef(onClose);

  // Keep onClose ref up to date
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();

  // Register layer on mount
  useEffect(() => {
    layerIdRef.current = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.FUZZY_FILE_SEARCH,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: 'Fuzzy File Search',
      onEscape: () => onCloseRef.current()
    });

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [registerLayer, unregisterLayer]);

  // Update handler when onClose changes
  useEffect(() => {
    if (layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, () => {
        onCloseRef.current();
      });
    }
  }, [updateLayerHandler]);

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Flatten the entire tree (all files, regardless of expansion state)
  const allFiles = useMemo(() => {
    return flattenEntireTree(fileTree);
  }, [fileTree]);

  // Filter and sort files based on search query
  const filteredFiles = useMemo(() => {
    if (!search.trim()) {
      // No search - show all files sorted alphabetically by path
      return [...allFiles].sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    }

    // Fuzzy search on both name and full path
    const results = allFiles.map(file => {
      const nameResult = fuzzyMatchWithScore(file.name, search);
      const pathResult = fuzzyMatchWithScore(file.fullPath, search);
      const bestScore = Math.max(nameResult.score, pathResult.score);
      const matches = nameResult.matches || pathResult.matches;

      return { file, score: bestScore, matches };
    });

    return results
      .filter(r => r.matches)
      .sort((a, b) => b.score - a.score)
      .map(r => r.file);
  }, [allFiles, search]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
    setFirstVisibleIndex(0);
  }, [search]);

  // Scroll selected item into view
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  // Track scroll position to determine which items are visible
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const scrollTop = scrollContainerRef.current.scrollTop;
      const itemHeight = 40; // Approximate height of each item
      const visibleIndex = Math.floor(scrollTop / itemHeight);
      setFirstVisibleIndex(visibleIndex);
    }
  };

  const handleItemSelect = (file: FlatFileItem) => {
    onFileSelect(file);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredFiles[selectedIndex]) {
        handleItemSelect(filteredFiles[selectedIndex]);
      }
    } else if (e.metaKey && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(e.key)) {
      e.preventDefault();
      // 1-9 map to positions 1-9, 0 maps to position 10
      const number = e.key === '0' ? 10 : parseInt(e.key);
      // Cap firstVisibleIndex so hotkeys always work for the last 10 items
      const maxFirstIndex = Math.max(0, filteredFiles.length - 10);
      const effectiveFirstIndex = Math.min(firstVisibleIndex, maxFirstIndex);
      const targetIndex = effectiveFirstIndex + number - 1;
      if (filteredFiles[targetIndex]) {
        handleItemSelect(filteredFiles[targetIndex]);
      }
    }
  };

  // Get the directory part of a path (everything before the last /)
  const getDirectory = (fullPath: string): string => {
    const lastSlash = fullPath.lastIndexOf('/');
    return lastSlash > 0 ? fullPath.substring(0, lastSlash) : '';
  };

  return (
    <div className="fixed inset-0 modal-overlay flex items-start justify-center pt-32 z-[9999] animate-in fade-in duration-100">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fuzzy File Search"
        tabIndex={-1}
        className="w-[600px] rounded-xl shadow-2xl border overflow-hidden flex flex-col max-h-[550px] outline-none"
        style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
      >
        {/* Search Header */}
        <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: theme.colors.border }}>
          <Search className="w-5 h-5" style={{ color: theme.colors.textDim }} />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-lg placeholder-opacity-50"
            placeholder="Search files..."
            style={{ color: theme.colors.textMain }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center gap-2">
            {shortcut && (
              <span className="text-xs font-mono opacity-60" style={{ color: theme.colors.textDim }}>
                {formatShortcutKeys(shortcut.keys)}
              </span>
            )}
            <div
              className="px-2 py-0.5 rounded text-xs font-bold"
              style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textDim }}
            >
              ESC
            </div>
          </div>
        </div>

        {/* File List */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="overflow-y-auto py-2 scrollbar-thin flex-1"
        >
          {filteredFiles.map((file, i) => {
            const isSelected = i === selectedIndex;

            // Calculate dynamic number badge
            const maxFirstIndex = Math.max(0, filteredFiles.length - 10);
            const effectiveFirstIndex = Math.min(firstVisibleIndex, maxFirstIndex);
            const distanceFromFirstVisible = i - effectiveFirstIndex;
            const showNumber = distanceFromFirstVisible >= 0 && distanceFromFirstVisible < 10;
            const numberBadge = distanceFromFirstVisible === 9 ? 0 : distanceFromFirstVisible + 1;

            const directory = getDirectory(file.fullPath);

            return (
              <button
                key={file.fullPath}
                ref={isSelected ? selectedItemRef : null}
                onClick={() => handleItemSelect(file)}
                className="w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-opacity-10"
                style={{
                  backgroundColor: isSelected ? theme.colors.accent : 'transparent',
                  color: isSelected ? theme.colors.accentForeground : theme.colors.textMain
                }}
              >
                {/* Number Badge */}
                {showNumber ? (
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textDim }}
                  >
                    {numberBadge}
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-5 h-5" />
                )}

                {/* File/Folder Icon */}
                {file.isFolder ? (
                  <Folder className="w-4 h-4 flex-shrink-0" style={{ color: isSelected ? theme.colors.accentForeground : theme.colors.warning }} />
                ) : (
                  <File className="w-4 h-4 flex-shrink-0" style={{ color: isSelected ? theme.colors.accentForeground : theme.colors.textDim }} />
                )}

                {/* File Info */}
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-medium truncate">{file.name}</span>
                  {directory && (
                    <span
                      className="text-[10px] truncate"
                      style={{ color: isSelected ? theme.colors.accentForeground : theme.colors.textDim, opacity: 0.7 }}
                    >
                      {directory}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {filteredFiles.length === 0 && (
            <div className="px-4 py-4 text-center opacity-50 text-sm" style={{ color: theme.colors.textDim }}>
              {search ? 'No files match your search' : 'No files to search'}
            </div>
          )}
        </div>

        {/* Footer with stats */}
        <div
          className="px-4 py-2 border-t text-xs flex items-center justify-between"
          style={{ borderColor: theme.colors.border, color: theme.colors.textDim }}
        >
          <span>{filteredFiles.length} files</span>
          <span>↑↓ navigate • Enter select • ⌘1-9 quick select</span>
        </div>
      </div>
    </div>
  );
}
