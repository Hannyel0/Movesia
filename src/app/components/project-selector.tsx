"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus, Folder, Settings, RefreshCw } from "lucide-react"

import { cn } from "@/app/lib/utils"
import { Button } from "@/app/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/app/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover"
import type { UnityProject } from "../../types/unity-project"

interface ProjectSelectorProps {
  className?: string
}

export function ProjectSelector({ className }: ProjectSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("")
  const [unityProjects, setUnityProjects] = React.useState<UnityProject[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const selectedProject = unityProjects.find((project) => project.path === value)

  // Load Unity projects on component mount
  React.useEffect(() => {
    console.log('🚀 ProjectSelector: Component mounted, starting Unity project scan...')
    loadUnityProjects()
  }, [])

  const loadUnityProjects = async () => {
    console.log('📡 ProjectSelector: Starting loadUnityProjects...')
    setIsLoading(true)
    setError(null)
    try {
      console.log('📡 ProjectSelector: Invoking unity:scan-projects IPC...')
      const projects = await window.electron.ipcRenderer.invoke('unity:scan-projects')
      console.log('✅ ProjectSelector: IPC response received:', projects)
      console.log(`📊 ProjectSelector: Found ${projects.length} Unity projects:`, projects.map(p => ({ name: p.name, path: p.path, version: p.editorVersion })))
      setUnityProjects(projects)
      console.log('💾 ProjectSelector: State updated with projects')
    } catch (err) {
      console.error('❌ ProjectSelector: Failed to load Unity projects:', err)
      setError('Failed to scan Unity projects')
    } finally {
      setIsLoading(false)
      console.log('🏁 ProjectSelector: Loading finished')
    }
  }

  const handleAddProject = async () => {
    console.log('➕ ProjectSelector: Starting manual project addition...')
    try {
      setError(null)
      console.log('📂 ProjectSelector: Opening project selection dialog...')
      const project = await window.electron.ipcRenderer.invoke('unity:select-project-dialog')
      console.log('📂 ProjectSelector: Dialog result:', project)
      if (project) {
        // Add to list if not already present
        setUnityProjects(prev => {
          const exists = prev.some(p => p.path === project.path)
          console.log(`🔍 ProjectSelector: Project exists check - ${project.name}: ${exists}`)
          if (exists) return prev
          console.log('📝 ProjectSelector: Adding new project to list')
          return [...prev, project]
        })
        setValue(project.path)
        console.log('✅ ProjectSelector: Added project and set as selected:', project)
      } else {
        console.log('🚫 ProjectSelector: No project selected from dialog')
      }
    } catch (err) {
      console.error('❌ ProjectSelector: Failed to add project:', err)
      setError('Failed to add project')
    }
    setOpen(false)
    console.log('🏁 ProjectSelector: Manual addition finished')
  }

  const handleRefreshProjects = async () => {
    console.log('🔄 ProjectSelector: Refreshing projects...')
    await loadUnityProjects()
  }

  const handleManageProjects = () => {
    // Future: Open project management settings
    console.log("Manage projects")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-10 px-3 justify-start text-sm font-medium text-white/90 hover:text-white hover:bg-white/5 bg-transparent border border-white/20 rounded-lg backdrop-blur-sm transition-all duration-200",
            className
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Folder className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {isLoading ? "Scanning..." : selectedProject ? selectedProject.name : "Select Project"}
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
                {unityProjects.map((project) => (
                  <CommandItem
                    key={project.path}
                    value={project.path}
                    onSelect={(currentValue: string) => {
                      setValue(currentValue === value ? "" : currentValue)
                      setOpen(false)
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3 w-3",
                        value === project.path ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{project.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {project.path} {project.editorVersion && `• Unity ${project.editorVersion}`}
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
  )
}
