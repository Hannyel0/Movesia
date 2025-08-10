// src/app/components/project-selector.tsx
"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, Folder, Settings, RefreshCw } from "lucide-react";

import { cn } from "@/app/lib/utils";
import { Button } from "@/app/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/app/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import type { UnityProject } from "../../types/unity-project";
import { UNITY_CURRENT_PROJECT, UNITY_GET_CURRENT_PROJECT } from "../../channels/wsChannels";

function norm(p: string) {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}
function dedupeByPath(list: UnityProject[]) {
  const byPath = new Map<string, UnityProject>();
  for (const p of list) byPath.set(norm(p.path), { ...p, path: norm(p.path) });
  return Array.from(byPath.values());
}

interface ProjectSelectorProps { className?: string }

export function ProjectSelector({ className }: ProjectSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [unityProjects, setUnityProjects] = React.useState<UnityProject[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedProject = unityProjects.find(p => p.path === value);

  // 1) Subscribe to pushes + hydrate once on mount
  React.useEffect(() => {
    const handler = (_e: unknown, proj: UnityProject) => {
      const np = { ...proj, path: norm(proj.path) };
      setUnityProjects(prev => dedupeByPath([...prev, np]));
      setValue(np.path);
    };

    const off = window.electron.ipcRenderer.on?.(UNITY_CURRENT_PROJECT, handler);

    window.electron.ipcRenderer.invoke(UNITY_GET_CURRENT_PROJECT)
      .then((proj?: UnityProject | null) => {
        if (proj) {
          const np = { ...proj, path: norm(proj.path) };
          setUnityProjects(prev => dedupeByPath([...prev, np]));
          setValue(np.path);
        }
      })
      .catch(() => {});

    return () => {
      if (typeof off === "function") off();
      else window.electron.ipcRenderer.removeListener?.(UNITY_CURRENT_PROJECT, handler as any);
    };
  }, []);

  // 2) Scan/refresh list (merge, don’t overwrite)
  const loadUnityProjects = async () => {
    setIsLoading(true); setError(null);
    try {
      const projects = await window.electron.ipcRenderer.invoke("unity:scan-projects");
      setUnityProjects(prev => dedupeByPath([...prev, ...projects]));
      if (!value) {
        const current = await window.electron.ipcRenderer.invoke(UNITY_GET_CURRENT_PROJECT);
        if (current) setValue(norm(current.path));
      }
    } catch (err) {
      setError("Failed to scan Unity projects");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => { loadUnityProjects(); }, []);

  const handleAddProject = async () => {
    try {
      setError(null);
      const project = await window.electron.ipcRenderer.invoke("unity:select-project-dialog");
      if (project) {
        const np = { ...project, path: norm(project.path) };
        setUnityProjects(prev => dedupeByPath([...prev, np]));          // <-- fixed spread
        setValue(np.path);
      }
    } catch (err) {
      setError("Failed to add project");
    }
    setOpen(false);
  };

  const handleRefreshProjects = async () => { await loadUnityProjects(); };
  const handleManageProjects = () => { setOpen(false); /* future settings */ };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" role="combobox" aria-expanded={open}
          className={cn(
            "h-10 px-3 justify-start text-sm font-medium text-white/90 hover:text-white hover:bg-white/5 bg-transparent border border-white/20 rounded-lg backdrop-blur-sm transition-all duration-200",
            className
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Folder className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {/* Prefer showing the selected project even while loading */}
              {selectedProject ? selectedProject.name : (isLoading ? "Scanning..." : "Select Project")}
            </span>
          </div>
          {isLoading ? (
            <RefreshCw className="ml-auto h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search projects..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Scanning for Unity projects..." : error || "No Unity projects found."}
            </CommandEmpty>
            {unityProjects.length > 0 && (
              <CommandGroup heading="Unity Projects">
                {unityProjects.map(project => (
                  <CommandItem
                    key={project.path}
                    value={project.path}
                    onSelect={(currentValue: string) => { setValue(currentValue); setOpen(false); }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-2 h-3 w-3", value === project.path ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{project.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {project.path}{project.editorVersion ? ` • Unity ${project.editorVersion}` : ""}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={handleRefreshProjects} className="text-xs">
                <RefreshCw className="mr-2 h-3 w-3" />
                <span>Refresh Projects</span>
              </CommandItem>
              <CommandItem onSelect={handleAddProject} className="text-xs">
                <Plus className="mr-2 h-3 w-3" />
                <span>Add Project Manually</span>
              </CommandItem>
              <CommandItem onSelect={handleManageProjects} className="text-xs">
                <Settings className="mr-2 h-3 w-3" />
                <span>Manage Projects</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}