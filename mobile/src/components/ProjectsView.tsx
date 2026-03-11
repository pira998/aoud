import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  FolderKanban,
  FolderPlus,
  Clock,
  Folder,
  Sparkles,
  FileText,
  RefreshCw,
} from 'lucide-react';
import type { ProjectInfo, SessionFolderEntry } from '../../../shared/types';
import { NewSessionDialog } from './NewSessionDialog';
import { cn } from '../lib/utils';

// --- Aceternity-inspired Spotlight Card ---
const SpotlightCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  isActive?: boolean;
  onClick: () => void;
}> = ({ children, className, isActive, onClick }) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!cardRef.current || !e.touches[0]) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top,
    });
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setIsHovered(false)}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative group rounded-xl border overflow-hidden cursor-pointer transition-all duration-200',
        isActive
          ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/10'
          : 'border-border/60 bg-card hover:border-primary/30',
        className
      )}
    >
      {/* Spotlight gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: isHovered
            ? `radial-gradient(350px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(139, 92, 246, 0.06), transparent 40%)`
            : 'none',
        }}
      />
      {/* Glow border effect */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: isHovered
            ? `radial-gradient(250px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(139, 92, 246, 0.12), transparent 40%)`
            : 'none',
        }}
      />
      {children}
    </motion.div>
  );
};

// --- Props Interface ---
interface ProjectsViewProps {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onStartWorking: () => void;
  onStartSessionInFolder: (folderPath: string) => void;
  // New session folder props
  sessionFolders: {
    basePath: string;
    folders: SessionFolderEntry[];
  } | null;
  folderCreationResult: {
    success: boolean;
    folderPath?: string;
    folderName?: string;
    error?: string;
  } | null;
  clearFolderCreationResult: () => void;
  onListSessionFolders: (search?: string) => void;
  onCreateSessionFolder: (name: string) => void;
  onRefreshProjects: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onStartWorking,
  onStartSessionInFolder,
  sessionFolders,
  folderCreationResult,
  clearFolderCreationResult,
  onListSessionFolders,
  onCreateSessionFolder,
  onRefreshProjects,
}) => {
  const [showNewSession, setShowNewSession] = useState(false);

  const handleSelectAndWork = (projectId: string) => {
    onSelectProject(projectId);
    onStartWorking();
  };

  const handleFolderSelected = (folderPath: string) => {
    setShowNewSession(false);
    clearFolderCreationResult(); // Clear stale result so it doesn't re-trigger
    onStartSessionInFolder(folderPath);
  };

  const handleOpenNewSession = () => {
    setShowNewSession(true);
    onListSessionFolders(); // Load folders from base directory
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

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/80 backdrop-blur-md border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Projects</h2>
            {projects.length > 0 && (
              <span className="text-xs bg-secondary/50 text-muted-foreground px-2 py-0.5 rounded-full">
                {projects.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRefreshProjects}
              className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
              title="Refresh projects"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleOpenNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <FolderPlus className="h-4 w-4" />
              <span>New Session</span>
            </motion.button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Auto-discovered from ~/.claude/projects
        </p>
      </div>

      <div className="p-4">
        {/* Project Cards */}
        {projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="p-4 bg-secondary/30 rounded-2xl mb-4">
              <Folder className="h-12 w-12 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-6">
              Create a new project folder to get started. Your sessions will appear here automatically.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleOpenNewSession}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Create & Start Session
            </motion.button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {projects.map((project, index) => {
              const isActive = project.id === activeProjectId;

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <SpotlightCard
                    isActive={isActive}
                    onClick={() => handleSelectAndWork(project.id)}
                  >
                    <div className="p-3 relative">
                      {/* Active indicator dot */}
                      {isActive && (
                        <div className="absolute top-2.5 right-2.5">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                          </span>
                        </div>
                      )}

                      {/* Folder icon */}
                      <div
                        className={cn(
                          'p-2 rounded-lg w-fit mb-2.5',
                          isActive ? 'bg-primary/15' : 'bg-secondary/50'
                        )}
                      >
                        <FolderKanban
                          className={cn(
                            'h-5 w-5',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                      </div>

                      {/* Project name */}
                      <h3 className="font-semibold text-sm truncate mb-1 pr-4">
                        {project.name}
                      </h3>

                      {/* Meta info */}
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground/70">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {formatRelativeTime(project.lastAccessed)}
                          </span>
                        </div>
                        {project.sessionCount !== undefined &&
                          project.sessionCount > 0 && (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3 shrink-0" />
                              <span>
                                {project.sessionCount} session
                                {project.sessionCount > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Session Dialog */}
      <NewSessionDialog
        isOpen={showNewSession}
        basePath={sessionFolders?.basePath || null}
        folders={sessionFolders?.folders || []}
        folderCreationResult={folderCreationResult}
        onSearch={(query) => onListSessionFolders(query || undefined)}
        onCreateFolder={onCreateSessionFolder}
        onSelectFolder={handleFolderSelected}
        onClose={() => { setShowNewSession(false); clearFolderCreationResult(); }}
        onRefresh={() => onListSessionFolders()}
      />
    </div>
  );
};
