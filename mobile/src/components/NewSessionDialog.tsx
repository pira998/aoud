import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderPlus,
  Search,
  Folder,
  X,
  Loader2,
  Clock,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import type { SessionFolderEntry } from '../../../shared/types';

interface NewSessionDialogProps {
  isOpen: boolean;
  basePath: string | null;
  folders: SessionFolderEntry[];
  folderCreationResult: {
    success: boolean;
    folderPath?: string;
    folderName?: string;
    error?: string;
  } | null;
  onSearch: (query: string) => void;
  onCreateFolder: (name: string) => void;
  onSelectFolder: (folderPath: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}

export const NewSessionDialog: React.FC<NewSessionDialogProps> = ({
  isOpen,
  basePath,
  folders,
  folderCreationResult,
  onSearch,
  onCreateFolder,
  onSelectFolder,
  onClose,
  onRefresh,
}) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const createInputRef = useRef<HTMLInputElement>(null);

  // Load folders when dialog opens
  useEffect(() => {
    if (isOpen) {
      onRefresh();
      setNewFolderName('');
      setSearchQuery('');
      setValidationError(null);
      setIsCreating(false);
    }
  }, [isOpen]);

  // Handle folder creation result — only when dialog is open and actively creating
  useEffect(() => {
    if (!isOpen || !isCreating || !folderCreationResult) return;
    setIsCreating(false);
    if (folderCreationResult.success && folderCreationResult.folderPath) {
      // Auto-start session in the newly created folder
      onSelectFolder(folderCreationResult.folderPath);
    } else if (folderCreationResult.error) {
      setValidationError(folderCreationResult.error);
    }
  }, [folderCreationResult, isOpen, isCreating]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      onSearch(searchQuery);
    }, 200);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  if (!isOpen) return null;

  const validateFolderName = (name: string): string | null => {
    if (!name.trim()) return 'Folder name is required';
    if (name.includes('/') || name.includes('\\')) return 'Folder name cannot contain slashes';
    if (name.includes('..')) return 'Invalid folder name';
    if (name.startsWith('.')) return 'Folder name cannot start with a dot';
    if (name.length > 100) return 'Folder name is too long';
    return null;
  };

  const handleCreateFolder = () => {
    const error = validateFolderName(newFolderName);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setIsCreating(true);
    onCreateFolder(newFolderName.trim());
  };

  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const isLoading = isOpen && basePath === null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-base font-semibold">New Session</h2>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </motion.button>
          </div>

          {/* Create New Folder Section */}
          <div className="px-4 py-3 border-b border-border/30 bg-secondary/20">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Create new project folder
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  ref={createInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => {
                    setNewFolderName(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="my-awesome-project"
                  className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground/40 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                  }}
                  autoFocus
                />
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || isCreating}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderPlus className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Create & Start</span>
                <span className="sm:hidden">Create</span>
              </motion.button>
            </div>
            {/* Validation Error */}
            <AnimatePresence>
              {validationError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>{validationError}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Search Section */}
          <div className="px-4 py-2.5 border-b border-border/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search existing folders..."
                className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground/40 transition-all"
              />
            </div>
          </div>

          {/* Folder List */}
          <div className="flex-1 overflow-y-auto min-h-[180px] max-h-[350px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
            ) : folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="p-3 bg-secondary/30 rounded-2xl mb-3">
                  <Folder className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {searchQuery ? 'No folders found' : 'No project folders yet'}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Create your first project folder above'}
                </p>
              </div>
            ) : (
              <div className="py-1">
                {folders.map((folder, index) => (
                  <motion.button
                    key={folder.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => onSelectFolder(folder.path)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-primary/5 active:bg-primary/10 group"
                  >
                    <div className="p-2 rounded-lg bg-secondary/50 group-hover:bg-primary/10 transition-colors shrink-0">
                      <Folder className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {folder.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground/50" />
                        <span className="text-xs text-muted-foreground/60">
                          {formatRelativeTime(folder.modifiedAt)}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/60 transition-colors shrink-0" />
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Footer - Base Path */}
          <div className="px-4 py-2.5 border-t border-border/50 bg-card/80">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground/50 font-mono truncate">
                  {basePath || 'Loading...'}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground/40 shrink-0">
                {folders.length} folder{folders.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
