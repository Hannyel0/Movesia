import ConnectionIndicator from "@/app/components/connection-indicator";
import Sidebar from "@/app/components/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";

import type { Message } from "@langchain/langgraph-sdk";
import { useStream } from "@langchain/langgraph-sdk/react";
import { uiMessageReducer, LoadExternalComponent, type UIMessage } from "@langchain/langgraph-sdk/react-ui";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Lightbulb } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { FaArrowUp } from "react-icons/fa6";
import ReactMarkdown from "react-markdown";
import TextareaAutosize from "react-textarea-autosize";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

// Using the Message type from @langchain/langgraph-sdk
// interface Message {
//   id: string;
//   content: string;
//   type: 'human' | 'ai';
//   timestamp?: Date;
//   isLoading?: boolean;
// }

// LangGraph dev server API (defaults to :2024). If running FastAPI standalone, change to :8000.
const API_URL = "http://localhost:2024";

// Heuristic: hide raw tool JSON blobs that should not render as chat text
function isLikelyToolJsonBlob(content: string): boolean {
  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj === "object") {
      const keys = Object.keys(obj as Record<string, unknown>);
      const indicative = [
        "success",
        "question",
        "answer",
        "supporting_documents",
        "document_count",
      ];
      return indicative.some((k) => keys.includes(k));
    }
  } catch (_) {
    // not JSON
  }
  return false;
}

// ReasoningBubble component for displaying current reasoning step
// Branch switcher component for conversation branching
function BranchSwitcher({
  branch,
  branchOptions,
  onSelect,
}: {
  branch: string | undefined;
  branchOptions: string[] | undefined;
  onSelect: (branch: string) => void;
}) {
  if (!branchOptions || !branch || branchOptions.length <= 1) return null;

  const index = branchOptions.indexOf(branch);

  return (
    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
      <button
        type="button"
        onClick={() => {
          const prevBranch = branchOptions[index - 1];
          if (prevBranch) onSelect(prevBranch);
        }}
        disabled={index === 0}
        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
      >
        ←
      </button>
      <span className="text-gray-300">
        {index + 1} / {branchOptions.length}
      </span>
      <button
        type="button"
        onClick={() => {
          const nextBranch = branchOptions[index + 1];
          if (nextBranch) onSelect(nextBranch);
        }}
        disabled={index === branchOptions.length - 1}
        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
      >
        →
      </button>
    </div>
  );
}

function ReasoningBubble({
  interrupt,
}: {
  interrupt: { value?: InterruptType } | null;
}) {
  if (!interrupt) return null;

  // Extract content from the interrupt value
  const value = interrupt.value as InterruptType | undefined;
  const content =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "content" in value
      ? (value as { content?: string }).content || JSON.stringify(value)
      : JSON.stringify(value);

  return (
    <div className="mb-3">
      <AnimatePresence mode="wait">
        <motion.div
          key={`interrupt-${Date.now()}`} // Use timestamp as key
          initial={{ opacity: 0, x: -10, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="reasoning-bubble max-w-[80%] px-3 py-2 bg-[#2a2a2a] rounded-2xl border border-gray-700/30"
        >
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-0.5">
              <Lightbulb className="h-3 w-3 text-yellow-400" />
            </div>
            <div className="text-xs text-gray-300 leading-relaxed">
              <strong className="capitalize text-gray-200">Interrupt</strong>
              <span className="text-gray-400 ml-1">•</span>
              <span className="text-gray-300 ml-1">{content}</span>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Animation variants for the input container
const inputVariants = {
  landing: {
    top: "50%",
    y: "-50%",
    bottom: "auto",
    width: "100%",
    maxWidth: "48rem", // max-w-3xl equivalent
  },
  chat: {
    top: "auto",
    bottom: "1rem",
    y: 0,
    width: "100%",
    maxWidth: "45rem", // max-w-2xl equivalent (smaller at bottom)
  },
};

// Define interrupt type for better type safety based on LangGraph SDK
interface InterruptType {
  type: string;
  message?: string;
  data?: unknown;
  value?: string | { content?: string; [key: string]: unknown };
}

// State type with UI message handling for Generative UI
interface MovesiaState extends Record<string, unknown> {
  messages: Message[];
  ui?: UIMessage[];
  context?: Record<string, unknown>;
}

// Chat session interface for sidebar
interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
  messageCount: number;
}

export function LandingScreen() {
  const [inputValue, setInputValue] = useState("");
  const [mode, setMode] = useState("agent");
  const [isChatMode, setIsChatMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Removed toolEvents state - no longer tracking tool calls
  const [_threadId, setThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
    {
      id: "1",
      title: "Getting started with Movesia",
      timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      messageCount: 5,
    },
    {
      id: "2",
      title: "How to use RAG retrieval",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      messageCount: 12,
    },
    {
      id: "3",
      title: "LangGraph integration help",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      messageCount: 8,
    },
  ]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("1");

  // Initialize LangGraph useStream hook with UI message support
  const thread = useStream<
    MovesiaState,
    {
      InterruptType: InterruptType;
      UpdateType: {
        messages: Message | Message[];
        ui?: UIMessage[];
        context?: Record<string, unknown>;
      };
      ConfigurableType: { model?: string; temperature?: number };
      CustomEventType: { type: string; [key: string]: unknown };
    }
  >({
    apiUrl: API_URL, // Use mounted LangGraph endpoints
    assistantId: "agent",
    messagesKey: "messages",
    reconnectOnMount: true, // Auto-resume streams after page refresh
    onThreadId: setThreadId,
    onCreated: (run) => {
      if (typeof window !== "undefined" && run.thread_id) {
        window.sessionStorage.setItem(`resume:${run.thread_id}`, run.run_id);
      }
    },
    onFinish: (_, run) => {
      if (typeof window !== "undefined" && run?.thread_id) {
        window.sessionStorage.removeItem(`resume:${run.thread_id}`);
        // Optional: Call cleanup endpoint
        fetch(`${API_URL}/chat/session/${run.thread_id}`, {
          method: "DELETE",
        }).catch((err) => console.warn("Session cleanup failed:", err));
      }
    },
    onError: (err) => {
      console.error("Stream error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "An error occurred while streaming";
      setError(errorMessage);
    },
    onUpdateEvent: (event) => {
      // Handle general update events
      console.log("Update event:", event);
    },
    onMetadataEvent: (event) => {
      // Handle metadata events (Run ID, Thread ID)
      console.log("Metadata event:", event);
    },
    onCustomEvent: (event: { type: string; [key: string]: unknown }, options) => {
      // Handle UI messages for Generative UI components
      if (event?.type === "ui" || event?.type === "remove-ui") {
        options.mutate((prev) => ({
          ...prev,
          ui: uiMessageReducer(prev.ui ?? [], event as UIMessage | { type: "remove-ui"; id: string }),
        }));
      }
    },
  });

  const { values: _values } = thread;

  // Sidebar handlers
  const handleNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New conversation",
      timestamp: new Date(),
      messageCount: 0,
    };
    setChatSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    // Reset chat state for new session
    setIsChatMode(false);
    setInputValue("");
  };

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    // Here you would typically load the session's messages
    // For now, we'll just switch the active session
  };

  const handleDeleteSession = (sessionId: string) => {
    setChatSessions(prev => prev.filter(session => session.id !== sessionId));
    if (currentSessionId === sessionId) {
      const remainingSessions = chatSessions.filter(s => s.id !== sessionId);
      if (remainingSessions.length > 0) {
        setCurrentSessionId(remainingSessions[0].id);
      } else {
        handleNewSession();
      }
    }
  };

  const handleRenameSession = (sessionId: string, newTitle: string) => {
    setChatSessions(prev => 
      prev.map(session => 
        session.id === sessionId 
          ? { ...session, title: newTitle }
          : session
      )
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [thread.messages]);

  // Clear error when new message is sent
  useEffect(() => {
    if (thread.isLoading) {
      setError(null);
    }
  }, [thread.isLoading]);

  const handleResumeInterrupt = () => {
    thread.submit(undefined, { command: { resume: true } });
  };

  const handleRegenerateMessage = (message: Message) => {
    const meta = thread.getMessagesMetadata(message);
    // Use snake_case exactly as in the docs, not camelCase:
    const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
    if (parentCheckpoint) {
      // Pass the string checkpoint directly—no .id needed:
      thread.submit(undefined, { checkpoint: parentCheckpoint });
    }
  };

  const handleSend = async () => {
    if (inputValue.trim()) {
      // If this is the first message, transition to chat mode
      if (!isChatMode) {
        setIsChatMode(true);
      }

      // Check if we're in testing mode
      if (mode === "testing") {
        // For testing mode, we'll still use the old approach temporarily
        // You can modify this later to work with your testing setup
        const testResponse = `# Movesia Backend Agent\n\n## Overview\nThe Movesia backend agent is the core server-side component of the Movesia project. It is responsible for handling requests, managing data, and orchestrating the actions of an AI-powered agent.`;

        console.log("Testing mode - would show:", testResponse);
        setInputValue("");
        return;
      }

      // Create the user message
      const userMessage: Message = {
        id: crypto.randomUUID(),
        type: "human",
        content: inputValue.trim(),
      };

      // Submit message using LangGraph useStream hook with optimistic updates
      thread.submit(
        {
          messages: [userMessage],
        },
        {
          streamResumable: true, // Enable resumable streaming
          optimisticValues: (prev) => {
            // Optimistically add the user message immediately
            const prevMessages = prev.messages ?? [];
            const newMessages = [...prevMessages, userMessage];
            return {
              ...prev,
              messages: newMessages,
            };
          },
        }
      );

      setInputValue("");
    }
  };

  const handleAttachment = () => {
    console.log("Attachment clicked");
    // Add your attachment logic here
  };

return (
  <div className="w-full h-full bg-[#1A1A1A] text-white overflow-hidden relative flex">
    {/* Sidebar */}
    <Sidebar
      isCollapsed={sidebarCollapsed}
      onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      sessions={chatSessions}
      currentSessionId={currentSessionId}
      onSessionSelect={handleSessionSelect}
      onNewSession={handleNewSession}
      onDeleteSession={handleDeleteSession}
      onRenameSession={handleRenameSession}
    />
    
    {/* Main Content */}
    <div className="flex-1 relative" style={{ backgroundColor: "#1B1B1B" }}>
      {/* Unity Connection Status Indicator */}
      <div className="absolute top-4 left-4 z-10">
        <ConnectionIndicator />
      </div>


      {/* Background Elements - Only show in landing mode */}
      {!isChatMode && (
        <>
          {/* Background Glow */}
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              style={{
                width: "120px",
                height: "120px",
                background: `radial-gradient(
                  circle at center,
                  rgba(39,39,39,0.45) 0%,
                  rgba(39,39,39,0.42) 15%,
                  rgba(39,39,39,0.38) 30%,
                  rgba(31,31,31,0.20) 50%,
                  rgba(31,31,31,0.15) 65%,
                  transparent 100%
                )`,
                filter: "blur(80px)",
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Title and Description */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center mb-8 -mt-32">
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
              Unity Agent
            </h1>
            <p className="text-gray-400 text-sm font-normal tracking-wide">
              Ask me anything about your project...
            </p>
          </div>

          {/* Footer hint */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center">
            <p className="text-xs text-gray-500">
              Press Enter to send • Shift + Enter for new line •{" "}
              {mode === "agent"
                ? "Agent Mode: Full AI assistance"
                : mode === "ask"
                ? "Ask Mode: Quick questions"
                : "Testing Mode: Hardcoded responses"}
            </p>
          </div>
        </>
      )}

      {/* Chat Messages Container - Only show in chat mode */}
      {isChatMode && (
        <div className="absolute inset-0 flex flex-col h-full">
          <div className="flex-1 overflow-y-auto px-6 pt-6 pb-32 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#282828] [&::-webkit-scrollbar-thumb:hover]:bg-[#3A3A3A] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:rounded-full">
            <div className="w-full max-w-[40rem] mx-auto space-y-6">
              {/* Display error if available */}
              {error && (
                <div className="flex justify-center mb-6">
                  <div className="max-w-[85%] px-4 py-3 bg-red-900/50 border border-red-700/50 rounded-2xl">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        <svg
                          className="h-4 w-4 text-red-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div className="text-sm text-red-200">
                        <strong className="text-red-100">Error:</strong>
                        <span className="ml-1">{error}</span>
                      </div>
                      <button
                        onClick={() => setError(null)}
                        className="ml-auto text-red-300 hover:text-red-100 transition-colors"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Display current interrupt if available */}
              {thread.interrupt && (
                <div className="flex justify-start mb-6">
                  <div className="max-w-[85%] text-white">
                    <ReasoningBubble interrupt={thread.interrupt} />
                    {/* Resume button for interrupts */}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={handleResumeInterrupt}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => thread.stop()}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {thread.messages.map((message, index) => {
                // Check if this is an AI message and if there are UI messages to show before it
                const isAIMessage = message.type === "ai";
                const previousMessage = index > 0 ? thread.messages[index - 1] : null;
                const shouldShowUIMessages = isAIMessage && previousMessage?.type === "human";
                
                const relevantUIMessages = shouldShowUIMessages 
                  ? thread.values?.ui?.filter((ui) => !ui?.metadata?.message_id && ui?.name === "search_chip") || []
                  : [];

                return (
                  <div key={message.id}>
                    {/* Render UI messages (search chip) before AI responses */}
                    {relevantUIMessages.length > 0 && (
                      <div className="flex justify-start mb-4 ml-4">
                        <div className="flex flex-col items-start gap-2">
                          {relevantUIMessages.map((ui) => (
                            <LoadExternalComponent key={ui.id} stream={thread} message={ui} />
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Render the actual message */}
                    <div
                      className={`flex ${
                        message.type === "human" ? "justify-end" : "justify-start"
                      } mb-6 group`}
                    >
                  <div
                    className={`${
                      message.type === "human"
                        ? "rounded-2xl px-4 py-3 bg-[#3A3A3A] text-white max-w-[80%]"
                        : "max-w-[85%] text-white"
                    } relative`}
                  >
                    {/* Message content */}
                    <div
                      className={`${
                        message.type === "ai"
                          ? "prose prose-sm prose-invert max-w-none"
                          : "text-sm leading-relaxed tracking-wide font-normal"
                      }`}
                    >
                      {message.type === "ai" &&
                      typeof message.content === "string" &&
                      !isLikelyToolJsonBlob(message.content) ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw, rehypeSanitize]}
                          components={{
                            a: ({ href, children, ...props }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                                {...props}
                              >
                                {children}
                              </a>
                            ),
                            code({
                              inline,
                              className,
                              children,
                              ...props
                            }: {
                              inline?: boolean;
                              className?: string;
                              children?: React.ReactNode;
                              [key: string]: unknown;
                            }) {
                              return inline ? (
                                <code
                                  className="bg-gray-800 text-gray-200 px-1.5 py-0.5 rounded text-xs font-mono"
                                  {...props}
                                >
                                  {children}
                                </code>
                              ) : (
                                <pre className="bg-gray-900 p-4 rounded-lg overflow-auto my-4 border border-gray-700">
                                  <code
                                    className={`${className} text-gray-200 text-xs font-mono`}
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                </pre>
                              );
                            },
                            h1: ({ children, ...props }) => (
                              <h1
                                className="text-xl font-bold text-white mb-4 mt-6"
                                {...props}
                              >
                                {children}
                              </h1>
                            ),
                            h2: ({ children, ...props }) => (
                              <h2
                                className="text-lg font-semibold text-white mb-3 mt-5"
                                {...props}
                              >
                                {children}
                              </h2>
                            ),
                            h3: ({ children, ...props }) => (
                              <h3
                                className="text-base font-medium text-white mb-2 mt-4"
                                {...props}
                              >
                                {children}
                              </h3>
                            ),
                            p: ({ children, ...props }) => (
                              <p
                                className="text-white mb-3 leading-relaxed"
                                {...props}
                              >
                                {children}
                              </p>
                            ),
                            ul: ({ children, ...props }) => (
                              <ul
                                className="list-disc list-inside text-white mb-3 space-y-1"
                                {...props}
                              >
                                {children}
                              </ul>
                            ),
                            ol: ({ children, ...props }) => (
                              <ol
                                className="list-decimal list-inside text-white mb-3 space-y-1"
                                {...props}
                              >
                                {children}
                              </ol>
                            ),
                            li: ({ children, ...props }) => (
                              <li className="text-white" {...props}>
                                {children}
                              </li>
                            ),
                            blockquote: ({ children, ...props }) => (
                              <blockquote
                                className="border-l-4 border-gray-600 pl-4 py-2 my-4 bg-gray-800/50 rounded-r"
                                {...props}
                              >
                                {children}
                              </blockquote>
                            ),
                            strong: ({ children, ...props }) => (
                              <strong
                                className="font-semibold text-white"
                                {...props}
                              >
                                {children}
                              </strong>
                            ),
                            em: ({ children, ...props }) => (
                              <em className="italic text-gray-200" {...props}>
                                {children}
                              </em>
                            ),
                          }}
                        >
                          {message.content as string}
                        </ReactMarkdown>
                      ) : message.type === "human" ? (
                        <span className="text-white">
                          {message.content as string}
                        </span>
                      ) : null}
                    </div>

                    {/* loading dots - show when thread is loading and this is the last AI message */}
                    {thread.isLoading &&
                      message.type === "ai" &&
                      message.id ===
                        thread.messages.filter((m) => m.type === "ai").pop()
                          ?.id && (
                        <div className="mt-2 flex space-x-1 justify-center">
                          <div
                            className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <div
                            className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <div
                            className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </div>
                      )}

                    {/* Message actions - show on hover for AI messages */}
                    {message.type === "ai" && !thread.isLoading && (
                      <div className="absolute -right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="flex flex-col gap-1">
                          {/* Regenerate button */}
                          <button
                            onClick={() => handleRegenerateMessage(message)}
                            className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
                            title="Regenerate response"
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                          </button>
                          {/* Copy button */}
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(
                                message.content as string
                              )
                            }
                            className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
                            title="Copy message"
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Removed Generative UI Components rendering */}

                    {/* Removed DEBUG UI message rendering */}

                    {/* Removed Tool Activity rendering */}

                    {/* Branch switcher for conversation branching */}
                    {(() => {
                      const meta = thread.getMessagesMetadata(message);
                      return (
                        <BranchSwitcher
                          branch={meta?.branch}
                          branchOptions={meta?.branchOptions}
                          onSelect={(branch) => thread.setBranch(branch)}
                        />
                      );
                    })()}
                  </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      )}

        {/* Animated Input Container */}
        <motion.div
          className="absolute left-1/2 z-20 px-6"
          style={{ translateX: "-50%" }}
          variants={inputVariants}
          initial="landing"
          animate={isChatMode ? "chat" : "landing"}
          transition={{ type: "tween", ease: "easeInOut", duration: 0.5 }}
        >
        <motion.div
          className={`shadow-lg transition-all duration-300 pb-3 overflow-hidden w-full max-w-[45rem] mx-auto ${
            inputValue.trim()
              ? "bg-[#2A2A2A]"
              : "bg-[#282828] hover:bg-[#2A2A2A]"
          }`}
          initial={{
            borderRadius: "1rem",
          }}
          animate={{
            borderRadius: isChatMode ? "1.5rem" : "1rem",
          }}
          transition={{ type: "tween", ease: "easeInOut", duration: 0.5 }}
        >
          {/* Text Input Area - Always on top */}
          <div className="relative">
            <TextareaAutosize
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isChatMode ? "Message Unity Agent..." : "Ask anything..."
              }
              maxRows={5}
              className="w-full resize-none rounded-t-2xl px-4 py-4 pr-16 bg-transparent border-0 text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 text-base min-h-[56px]"
              style={{
                backgroundColor: "transparent",
                borderColor: "transparent",
              }}
            />
          </div>

          {/* Bottom Controls Container - Always below */}
          <div className="px-4 flex items-center justify-between">
            {/* Mode Selector */}
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger
                className="cursor-pointer w-20 bg-[#3A3A3A] border-0 text-gray-300 text-[11px] hover:text-white transition-colors rounded-full px-2.5 hover:bg-[#505050] focus:ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                style={{
                  height: "19px",
                  minHeight: "19px",
                  lineHeight: "19px",
                  padding: "0 13px",
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#3A3A3A] border-gray-600 rounded-lg">
                <SelectItem
                  value="agent"
                  className="text-white hover:bg-[#454545] focus:bg-[#454545] cursor-pointer text-xs"
                >
                  Agent
                </SelectItem>
                <SelectItem
                  value="ask"
                  className="text-white hover:bg-[#454545] focus:bg-[#454545] cursor-pointer text-xs"
                >
                  Ask
                </SelectItem>
                <SelectItem
                  value="testing"
                  className="text-white hover:bg-[#454545] focus:bg-[#454545] cursor-pointer text-xs"
                >
                  Testing
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleAttachment}
                className="p-2 rounded-xl bg-[#3A3A3A] hover:bg-[#505050] transition-all duration-200"
              >
                <Paperclip className="text-gray-300 w-4 h-4 hover:text-white" />
              </button>
              {thread.isLoading ? (
                <button
                  onClick={() => thread.stop()}
                  className="p-2 rounded-xl transition-all duration-200 bg-red-600 hover:bg-red-700 text-white shadow-lg"
                  title="Stop generation"
                >
                  <span className="text-sm">Stop</span>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || !!error}
                  className={`p-2 rounded-xl transition-all duration-200 ${
                    inputValue.trim() && !error
                      ? "bg-white hover:bg-gray-200 text-black shadow-lg"
                      : "bg-[#404040] text-gray-500 cursor-not-allowed"
                  }`}
                  title={error ? "Fix error before sending" : "Send message"}
                >
                  <FaArrowUp
                    className={`text-sm ${
                      inputValue.trim() && !error
                        ? "text-black"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
