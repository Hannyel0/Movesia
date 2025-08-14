import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Plus,
  Settings,
  History,
  Search,
  PanelRightClose,
  Trash2,
  Edit3,
  MoreHorizontal,
  User,
  LogOut,
  CreditCard,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
  messageCount: number;
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  sessions: ChatSession[];
  currentSessionId?: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
}

export default function Sidebar({
  isCollapsed,
  onToggle,
  sessions,
  currentSessionId,
  onSessionSelect,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRename = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditTitle(currentTitle);
  };

  const saveRename = () => {
    if (editingSessionId && editTitle.trim()) {
      onRenameSession(editingSessionId, editTitle.trim());
    }
    setEditingSessionId(null);
    setEditTitle("");
  };

  const cancelRename = () => {
    setEditingSessionId(null);
    setEditTitle("");
  };



  return (
    <motion.div
      initial={false}
      animate={{
        width: isCollapsed ? 48 : 280,
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="relative bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col overflow-hidden shadow-none"
      style={{ 
        height: '100%',
        maxHeight: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div className="px-3 py-4">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2"
              >
                <MessageSquare className="h-4 w-4 text-primary" />
                <h1 className="font-medium text-sm">Movesia</h1>
              </motion.div>
            )}
          </AnimatePresence>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 p-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search with New Chat */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, delay: 0.15 }}
            className="px-3 py-3"
          >
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 bg-background/40 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/60 text-xs h-8"
                />
              </div>
              <Button
                onClick={onNewSession}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex-shrink-0"
                title="New Chat"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Sessions */}
      <div className="flex-1 overflow-hidden min-h-0">
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.2 }}
              className="px-2 py-4 h-full overflow-y-auto overflow-x-hidden sidebar-scroll"
            >
              <div className="space-y-1">
                {filteredSessions.map((session) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="group"
                  >
                    <div
                      className={`cursor-pointer transition-all duration-200 rounded-md px-3 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground relative ${
                        currentSessionId === session.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "bg-transparent"
                      }`}
                      onClick={() => onSessionSelect(session.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 pr-2">
                          {editingSessionId === session.id ? (
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onBlur={saveRename}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename();
                                if (e.key === "Escape") cancelRename();
                              }}
                              className="h-5 text-xs border-0 bg-black/20 focus:bg-black/30 text-white"
                              autoFocus
                            />
                          ) : (
                            <h3 className="font-medium text-xs truncate leading-tight">
                              {session.title}
                            </h3>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-2.5 w-2.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-28">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRename(session.id, session.title);
                              }}
                              className="text-xs"
                            >
                              <Edit3 className="h-3 w-3 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(session.id);
                              }}
                              className="text-destructive text-xs"
                            >
                              <Trash2 className="h-3 w-3 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {filteredSessions.length === 0 && searchQuery && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No conversations found</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed state - just icons */}
        {isCollapsed && (
          <div className="p-2 space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-10 p-0 cursor-pointer"
              onClick={onNewSession}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-10 p-0 cursor-pointer"
            >
              <History className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Footer - User Account */}
      <div className="px-3 py-4 flex-shrink-0">
        <AnimatePresence>
          {!isCollapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2.5 p-2 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src="https://github.com/shadcn.png" alt="User Avatar" />
                    <AvatarFallback className="bg-white/20 text-white text-[10px]">JD</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/90 truncate">John Doe</p>
                    <p className="text-[10px] text-white/60 truncate">john.doe@example.com</p>
                  </div>
                </motion.div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-48 mb-2">
                <DropdownMenuItem className="cursor-pointer">
                  <User className="mr-2 h-3 w-3" />
                  <span className="text-xs">Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <Settings className="mr-2 h-3 w-3" />
                  <span className="text-xs">Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <CreditCard className="mr-2 h-3 w-3" />
                  <span className="text-xs">Billing</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-3 w-3" />
                  <span className="text-xs">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex justify-center cursor-pointer">
                  <Avatar className="h-6 w-6 hover:ring-2 hover:ring-white/20 transition-all">
                    <AvatarImage src="https://github.com/shadcn.png" alt="User Avatar" />
                    <AvatarFallback className="bg-white/20 text-white text-[10px]">JD</AvatarFallback>
                  </Avatar>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-48 mb-2">
                <DropdownMenuItem className="cursor-pointer">
                  <User className="mr-2 h-3 w-3" />
                  <span className="text-xs">Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <Settings className="mr-2 h-3 w-3" />
                  <span className="text-xs">Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <CreditCard className="mr-2 h-3 w-3" />
                  <span className="text-xs">Billing</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-3 w-3" />
                  <span className="text-xs">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
