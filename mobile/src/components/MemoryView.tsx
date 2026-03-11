import { useState } from 'react';
import { Brain, FileText, Folder, User, Lock, Zap, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MemoryLocation {
  type: 'managed_policy' | 'project' | 'project_rules' | 'user' | 'project_local' | 'auto';
  path: string;
  content: string;
  exists: boolean;
  lastModified?: string;
  lineCount?: number;
}

interface MemoryViewProps {
  memoryData: {
    projectPath: string;
    projectName: string;
    locations: MemoryLocation[];
    timestamp: string;
  } | null;
  onRefresh: () => void;
  isLoading: boolean;
}

const MEMORY_TYPE_INFO = {
  managed_policy: {
    icon: Lock,
    title: 'Managed Policy',
    description: 'Organization-wide instructions managed by IT/DevOps',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  project: {
    icon: Folder,
    title: 'Project Memory',
    description: 'Team-shared instructions for the project',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  project_rules: {
    icon: FileText,
    title: 'Project Rules',
    description: 'Modular, topic-specific project instructions',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  user: {
    icon: User,
    title: 'User Memory',
    description: 'Personal preferences for all projects',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  project_local: {
    icon: FileText,
    title: 'Project Memory (Local)',
    description: 'Personal project-specific preferences',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  auto: {
    icon: Zap,
    title: 'Auto Memory',
    description: "Claude's automatic notes and learnings",
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
};

function MemoryCard({ location }: { location: MemoryLocation }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const info = MEMORY_TYPE_INFO[location.type];
  const Icon = info.icon;

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-3 p-4 hover:bg-secondary/30 transition-colors"
      >
        <div className={`p-2 rounded-lg ${info.bgColor}`}>
          <Icon className={`w-5 h-5 ${info.color}`} />
        </div>

        <div className="flex-1 text-left">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-foreground">{info.title}</h3>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">{info.description}</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{location.lineCount || 0} lines</span>
            <span>•</span>
            <span>Modified: {formatDate(location.lastModified)}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
            {location.path}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            <div className="p-4 bg-secondary/20 max-h-[500px] overflow-y-auto">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownRenderer content={location.content} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MemoryView({ memoryData, onRefresh, isLoading }: MemoryViewProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Brain className="w-12 h-12 mb-4 animate-pulse" />
        <p>Loading memory information...</p>
      </div>
    );
  }

  if (!memoryData || memoryData.locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Brain className="w-12 h-12 mb-4 opacity-50" />
        <p className="mb-2">No memory files found for this project</p>
        <p className="text-sm text-center max-w-md">
          Memory files include CLAUDE.md, auto memory, and project rules that help Claude understand your project context.
        </p>
        <button
          onClick={onRefresh}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
    );
  }

  // Group locations by type for better organization
  const groupedLocations = memoryData.locations.reduce((acc, loc) => {
    if (!acc[loc.type]) acc[loc.type] = [];
    acc[loc.type].push(loc);
    return acc;
  }, {} as Record<string, MemoryLocation[]>);

  // Order: managed_policy, project, project_rules, user, project_local, auto
  const typeOrder: Array<keyof typeof MEMORY_TYPE_INFO> = [
    'managed_policy', 'project', 'project_rules', 'user', 'project_local', 'auto'
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Brain className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">Claude Memory</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Project: <span className="font-mono">{memoryData.projectName}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {memoryData.locations.length} memory file{memoryData.locations.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-secondary/50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Info Box */}
      <div className="mb-6 p-4 border border-blue-500/30 bg-blue-500/5 rounded-lg">
        <h3 className="font-semibold mb-2 text-blue-400">📚 About Claude Memory</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Claude Code uses multiple memory locations to understand your project. More specific instructions take precedence over broader ones.
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li><strong>Managed Policy:</strong> Organization-wide standards (highest authority)</li>
          <li><strong>Project Memory:</strong> Team-shared project guidelines</li>
          <li><strong>Project Rules:</strong> Modular topic-specific rules</li>
          <li><strong>User Memory:</strong> Your personal preferences (all projects)</li>
          <li><strong>Project Local:</strong> Your private project preferences</li>
          <li><strong>Auto Memory:</strong> Claude's automatic learnings (first 200 lines only)</li>
        </ul>
      </div>

      {/* Memory Cards */}
      <div className="space-y-4">
        {typeOrder.map(type => {
          const locations = groupedLocations[type];
          if (!locations || locations.length === 0) return null;

          return locations.map((location, index) => (
            <MemoryCard
              key={`${type}-${index}`}
              location={location}
            />
          ));
        })}
      </div>
    </div>
  );
}
