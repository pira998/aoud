import { useState } from 'react';
import { Folder, FolderOpen, Plus, Trash2, Check, X } from 'lucide-react';
import type { ProjectInfo } from '../hooks/useWebSocket';

interface ProjectSelectorProps {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onAddProject: (path: string, name?: string) => void;
  onRemoveProject: (projectId: string) => void;
}

export function ProjectSelector({
  projects,
  activeProjectId,
  onSelectProject,
  onAddProject,
  onRemoveProject,
}: ProjectSelectorProps) {
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAddProject = () => {
    if (newProjectPath.trim()) {
      onAddProject(newProjectPath.trim(), newProjectName.trim() || undefined);
      setNewProjectPath('');
      setNewProjectName('');
      setIsAddingProject(false);
    }
  };

  const handleDeleteConfirm = (projectId: string) => {
    onRemoveProject(projectId);
    setConfirmDelete(null);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header with active project */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-yellow-400" />
            <span className="font-medium text-gray-200">
              {activeProject?.name || 'No Project Selected'}
            </span>
          </div>
          <button
            onClick={() => setIsAddingProject(true)}
            className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300"
            title="Add Project"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {activeProject && (
          <p className="text-xs text-gray-500 mt-1 truncate">
            {activeProject.path}
          </p>
        )}
      </div>

      {/* Add Project Form */}
      {isAddingProject && (
        <div className="p-3 border-b border-gray-700 bg-gray-850">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Project path (e.g., /Users/me/myproject)"
              value={newProjectPath}
              onChange={(e) => setNewProjectPath(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
              autoFocus
            />
            <input
              type="text"
              placeholder="Project name (optional)"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddProject}
                disabled={!newProjectPath.trim()}
                className="flex-1 flex items-center justify-center gap-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-3 rounded-lg text-sm transition-colors"
              >
                <Check className="w-4 h-4" />
                Add
              </button>
              <button
                onClick={() => {
                  setIsAddingProject(false);
                  setNewProjectPath('');
                  setNewProjectName('');
                }}
                className="flex-1 flex items-center justify-center gap-1 bg-gray-600 hover:bg-gray-500 text-white py-2 px-3 rounded-lg text-sm transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project List */}
      <div className="max-h-48 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No projects added yet.
            <br />
            Click + to add a project.
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={`flex items-center justify-between p-3 border-b border-gray-700 last:border-0 cursor-pointer hover:bg-gray-750 ${
                project.id === activeProjectId ? 'bg-gray-750' : ''
              }`}
              onClick={() => onSelectProject(project.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Folder
                  className={`w-4 h-4 flex-shrink-0 ${
                    project.id === activeProjectId
                      ? 'text-yellow-400'
                      : 'text-gray-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm truncate ${
                      project.id === activeProjectId
                        ? 'text-white font-medium'
                        : 'text-gray-300'
                    }`}
                  >
                    {project.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {project.path}
                  </p>
                </div>
              </div>

              {/* Delete button or confirm */}
              {confirmDelete === project.id ? (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConfirm(project.id);
                    }}
                    className="p-1.5 rounded bg-red-600 hover:bg-red-500 text-white"
                    title="Confirm Delete"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(null);
                    }}
                    className="p-1.5 rounded bg-gray-600 hover:bg-gray-500 text-white"
                    title="Cancel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(project.id);
                  }}
                  className="p-1.5 rounded hover:bg-gray-600 text-gray-500 hover:text-red-400 ml-2"
                  title="Remove Project"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
