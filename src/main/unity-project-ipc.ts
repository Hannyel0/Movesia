import { ipcMain, dialog } from 'electron';
import { findUnityProjects, isUnityProject, type UnityProject } from './unity-project-scanner';

export function registerUnityProjectHandlers() {
  // Scan for Unity projects from Unity Hub and optional extra directories
  ipcMain.handle('unity:scan-projects', async (_event, extraRoots?: string[]): Promise<UnityProject[]> => {
    try {
      console.log('Scanning for Unity projects...');
      const projects = await findUnityProjects(extraRoots || []);
      console.log(`Found ${projects.length} Unity projects`);
      return projects;
    } catch (error) {
      console.error('Error scanning Unity projects:', error);
      throw error;
    }
  });

  // Validate if a specific directory is a Unity project
  ipcMain.handle('unity:validate-project', async (_event, projectPath: string): Promise<UnityProject | null> => {
    try {
      console.log(`Validating Unity project at: ${projectPath}`);
      const project = await isUnityProject(projectPath);
      return project;
    } catch (error) {
      console.error('Error validating Unity project:', error);
      throw error;
    }
  });

  // Open file dialog to manually select a Unity project
  ipcMain.handle('unity:select-project-dialog', async (): Promise<UnityProject | null> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Unity Project Folder',
        buttonLabel: 'Select Project'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const selectedPath = result.filePaths[0];
      console.log(`User selected project path: ${selectedPath}`);
      
      const project = await isUnityProject(selectedPath);
      if (!project) {
        throw new Error('Selected folder is not a valid Unity project');
      }

      return project;
    } catch (error) {
      console.error('Error in project selection dialog:', error);
      throw error;
    }
  });

  // Get Unity Hub project candidates (for debugging/advanced users)
  ipcMain.handle('unity:get-hub-candidates', async (): Promise<string[]> => {
    try {
      // This is a simplified version that just returns the paths from Unity Hub
      // without validating them as Unity projects
      const { readHubRecentPaths } = await import('./unity-project-scanner');
      return await readHubRecentPaths();
    } catch (error) {
      console.error('Error getting Unity Hub candidates:', error);
      return [];
    }
  });
}
