import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectInfo } from '../../shared/types.js';

const CONFIG_DIR = path.join(os.homedir(), '.claude-mobile-bridge');
const PROJECTS_FILE = path.join(CONFIG_DIR, 'projects.json');

interface StoredProject {
  id: string;
  name: string;
  path: string;
  lastAccessed: string;
}

interface ProjectsData {
  projects: StoredProject[];
  activeProjectId?: string;
}

export class ProjectRegistry {
  private data: ProjectsData;

  constructor() {
    this.data = this.load();
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  private load(): ProjectsData {
    try {
      if (fs.existsSync(PROJECTS_FILE)) {
        const content = fs.readFileSync(PROJECTS_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
    return { projects: [] };
  }

  private save(): void {
    try {
      this.ensureConfigDir();
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving projects:', error);
    }
  }

  list(): ProjectInfo[] {
    return this.data.projects.map(p => ({
      id: p.id,
      name: p.name,
      path: p.path,
      lastAccessed: p.lastAccessed,
    }));
  }

  getActiveProjectId(): string | undefined {
    return this.data.activeProjectId;
  }

  getActiveProject(): ProjectInfo | undefined {
    if (!this.data.activeProjectId) return undefined;
    return this.data.projects.find(p => p.id === this.data.activeProjectId);
  }

  add(projectPath: string, name?: string): ProjectInfo {
    // Resolve to absolute path
    const absolutePath = path.resolve(projectPath);

    // Check if project already exists
    const existing = this.data.projects.find(p => p.path === absolutePath);
    if (existing) {
      // Update last accessed and return existing
      existing.lastAccessed = new Date().toISOString();
      this.save();
      return existing;
    }

    // Create new project
    const project: StoredProject = {
      id: uuidv4(),
      name: name || path.basename(absolutePath),
      path: absolutePath,
      lastAccessed: new Date().toISOString(),
    };

    this.data.projects.push(project);

    // If no active project, make this one active
    if (!this.data.activeProjectId) {
      this.data.activeProjectId = project.id;
    }

    this.save();
    return project;
  }

  remove(projectId: string): boolean {
    const index = this.data.projects.findIndex(p => p.id === projectId);
    if (index === -1) return false;

    this.data.projects.splice(index, 1);

    // If removed project was active, clear active or set to first available
    if (this.data.activeProjectId === projectId) {
      this.data.activeProjectId = this.data.projects[0]?.id;
    }

    this.save();
    return true;
  }

  setActive(projectId: string): ProjectInfo | undefined {
    const project = this.data.projects.find(p => p.id === projectId);
    if (!project) return undefined;

    this.data.activeProjectId = projectId;
    project.lastAccessed = new Date().toISOString();
    this.save();
    return project;
  }

  get(projectId: string): ProjectInfo | undefined {
    return this.data.projects.find(p => p.id === projectId);
  }

  updateLastAccessed(projectId: string): void {
    const project = this.data.projects.find(p => p.id === projectId);
    if (project) {
      project.lastAccessed = new Date().toISOString();
      this.save();
    }
  }
}

// Singleton instance
export const projectRegistry = new ProjectRegistry();
