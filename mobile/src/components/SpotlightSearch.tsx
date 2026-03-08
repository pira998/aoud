import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Folder, FileText, FileCode, Image, File, X, ChevronRight, Eye, Pencil, MousePointerClick, ArrowLeft } from 'lucide-react';
import type { FileSearchEntry } from '../../../shared/types';

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  onPreview: (filePath: string) => void;
  onEdit: (filePath: string) => void;
  onSelect: (filePath: string, fileName: string) => void;
  searchResults: FileSearchEntry[];
  isSearching: boolean;
}

function getFileIcon(entry: FileSearchEntry) {
  if (entry.isDirectory) return <Folder className="h-4 w-4 text-amber-400" />;
  const ext = entry.extension?.toLowerCase();
  if (!ext) return <File className="h-4 w-4 text-muted-foreground" />;

  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];
  if (imageExts.includes(ext)) return <Image className="h-4 w-4 text-pink-400" />;

  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.rb', '.php', '.swift', '.kt', '.cs'];
  if (codeExts.includes(ext)) return <FileCode className="h-4 w-4 text-blue-400" />;

  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatRelativeTime(mtime?: number) {
  if (!mtime) return '';
  const now = Date.now();
  const diff = now - mtime;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(mtime).toLocaleDateString();
}

// Extensions that can be edited
const EDITABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.swift', '.kt', '.cs', '.html', '.htm', '.css', '.scss', '.less',
  '.json', '.xml', '.yaml', '.yml', '.md', '.mdx', '.txt', '.sh', '.bash', '.zsh',
  '.sql', '.lua', '.dart', '.r', '.scala', '.toml', '.ini', '.env', '.vue', '.svelte',
  '.graphql', '.proto', '.csv', '.log', '.ex', '.exs', '.erl', '.hs', '.clj',
]);

function isEditable(entry: FileSearchEntry): boolean {
  if (entry.isDirectory) return false;
  if (!entry.extension) return false;
  return EDITABLE_EXTENSIONS.has(entry.extension.toLowerCase());
}

export const SpotlightSearch: React.FC<SpotlightSearchProps> = ({
  isOpen,
  onClose,
  onSearch,
  onPreview,
  onEdit,
  onSelect,
  searchResults,
  isSearching,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showActions, setShowActions] = useState<string | null>(null); // path of entry showing actions
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input when opened and load recent files
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setShowActions(null);
      // Load recent files on open (empty query)
      onSearch('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, onSearch]);

  // Debounced search
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setActiveIndex(0);
    setShowActions(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length > 0) {
      debounceRef.current = setTimeout(() => {
        onSearch(val.trim());
      }, 200);
    }
  }, [onSearch]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showActions) {
      if (e.key === 'Escape') {
        setShowActions(null);
        return;
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = searchResults[activeIndex];
      if (entry) {
        if (entry.isDirectory) {
          // Browse into directory
          setQuery('');
          onSearch('');
        } else {
          setShowActions(entry.path);
        }
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [searchResults, activeIndex, showActions, onClose, onSearch]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            className="relative w-[92vw] max-w-lg bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
              <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Search files and folders..."
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setShowActions(null); }}
                  className="p-1 rounded hover:bg-secondary/50"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="max-h-[50vh] overflow-y-auto"
            >
              {/* Recent files header when no query */}
              {query.trim() === '' && searchResults.length > 0 && (
                <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/30">
                  Recent Files
                </div>
              )}

              {query.trim() === '' && searchResults.length === 0 && !isSearching && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No recent files
                </div>
              )}

              {query.trim() !== '' && isSearching && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="inline-block mb-2"
                  >
                    <Search className="h-5 w-5" />
                  </motion.div>
                  <div>Searching...</div>
                </div>
              )}

              {query.trim() !== '' && !isSearching && searchResults.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No files found matching "{query}"
                </div>
              )}

              {searchResults.map((entry, i) => (
                <div key={entry.path} className="relative">
                  <div
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      i === activeIndex ? 'bg-primary/10' : 'hover:bg-secondary/30'
                    }`}
                    onClick={() => {
                      if (entry.isDirectory) {
                        // For directories, could browse into them
                        setShowActions(entry.path);
                      } else {
                        setShowActions(entry.path);
                      }
                    }}
                  >
                    {getFileIcon(entry)}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{entry.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {entry.path.replace(/^\/Users\/[^/]+\//, '~/')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Show relative time for recent files (when no query) */}
                      {query.trim() === '' && entry.mtime && (
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(entry.mtime)}</span>
                      )}
                      {/* Show size for search results */}
                      {query.trim() !== '' && entry.size !== undefined && (
                        <span className="text-xs text-muted-foreground">{formatSize(entry.size)}</span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Action buttons overlay */}
                  <AnimatePresence>
                    {showActions === entry.path && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="absolute inset-0 flex items-center bg-card/95 backdrop-blur-sm px-3 gap-2"
                      >
                        <button
                          onClick={() => { setShowActions(null); }}
                          className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                        >
                          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{entry.name}</span>

                        {/* View Button */}
                        <button
                          onClick={() => {
                            onPreview(entry.path);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-xs font-medium"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>

                        {/* Edit Button - only for text files */}
                        {isEditable(entry) && (
                          <button
                            onClick={() => {
                              onEdit(entry.path);
                              onClose();
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors text-xs font-medium"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        )}

                        {/* Select Button - insert into prompt */}
                        {!entry.isDirectory && (
                          <button
                            onClick={() => {
                              onSelect(entry.path, entry.name);
                              onClose();
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors text-xs font-medium"
                          >
                            <MousePointerClick className="h-3.5 w-3.5" />
                            Select
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border/30 text-xs text-muted-foreground flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-secondary/50 rounded text-[10px]">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-secondary/50 rounded text-[10px]">↵</kbd>
                actions
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-secondary/50 rounded text-[10px]">esc</kbd>
                close
              </span>
              {searchResults.length > 0 && (
                <span className="ml-auto">{searchResults.length} results</span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
