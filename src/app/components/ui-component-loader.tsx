import React from "react";

// Simple UI Component Loader for Generative UI
// This is a basic implementation that can be enhanced with dynamic loading

type UIMessageType =
  | "code_generation"
  | "file_operation"
  | "knowledge_retrieval"
  | "progress";

interface UIMessage {
  id: string;
  type: UIMessageType | (string & {});
  props: Record<string, unknown>;
  metadata?: {
    message_id?: string;
    [key: string]: unknown;
  };
}

interface UIComponentLoaderProps {
  message: UIMessage;
  fallback?: React.ReactNode;
  className?: string;
}

// Local component implementations (can be moved to separate files)
interface CodeGenerationProps {
  language: string;
  code: string;
  filename?: string;
  description?: string;
}

const CodeGenerationComponent: React.FC<CodeGenerationProps> = (props) => (
  <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 my-4">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-green-500 rounded-full" />
        <span className="text-green-400 font-medium">Code Generated</span>
        {props.filename && (
          <span className="text-gray-400 text-sm">• {props.filename}</span>
        )}
      </div>
      <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
        {props.language}
      </span>
    </div>

    {props.description && (
      <p className="text-gray-300 text-sm mb-3">{props.description}</p>
    )}

    <pre className="bg-black border border-gray-600 rounded p-3 overflow-x-auto">
      <code className="text-gray-200 text-sm font-mono">{props.code}</code>
    </pre>

    <div className="flex gap-2 mt-3">
      <button
        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
        onClick={() => navigator.clipboard.writeText(props.code)}
      >
        Copy Code
      </button>
      <button className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors">
        Apply Changes
      </button>
    </div>
  </div>
);

interface FileOperationProps {
  operation: "create" | "update" | "delete";
  filename: string;
  content?: string;
  status: "pending" | "success" | "error";
  message?: string;
}

const FileOperationComponent: React.FC<FileOperationProps> = (props) => {
  const getOperationColor = () => {
    switch (props.operation) {
      case "create":
        return "text-green-400";
      case "update":
        return "text-blue-400";
      case "delete":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusIcon = () => {
    switch (props.status) {
      case "pending":
        return "⏳";
      case "success":
        return "✅";
      case "error":
        return "❌";
      default:
        return "📄";
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 my-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{getStatusIcon()}</span>
        <span className={`font-medium capitalize ${getOperationColor()}`}>
          {props.operation}
        </span>
        <span className="text-gray-300">{props.filename}</span>
      </div>

      {props.message && (
        <p className="text-gray-400 text-sm mb-2">{props.message}</p>
      )}

      {props.content && props.operation !== "delete" && (
        <div className="bg-black border border-gray-700 rounded p-2 mt-2">
          <pre className="text-gray-300 text-xs overflow-x-auto">
            {props.content.length > 200
              ? props.content.substring(0, 200) + "..."
              : props.content}
          </pre>
        </div>
      )}
    </div>
  );
};

interface KnowledgeResultItem {
  content: string;
  score: number;
  source?: string;
}

interface KnowledgeRetrievalProps {
  query: string;
  results: KnowledgeResultItem[];
  totalResults: number;
}

const KnowledgeRetrievalComponent: React.FC<KnowledgeRetrievalProps> = (
  props
) => (
  <div className="bg-purple-900/20 border border-purple-600 rounded-lg p-4 my-4">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-purple-400">🧠</span>
      <span className="text-purple-300 font-medium">Knowledge Retrieved</span>
      <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded">
        {props.totalResults} results
      </span>
    </div>

    <div className="mb-3">
      <span className="text-gray-400 text-sm">Query: </span>
      <span className="text-gray-200 italic">"{props.query}"</span>
    </div>

    <div className="space-y-2">
      {props.results
        ?.slice(0, 3)
        .map((result: KnowledgeResultItem, index: number) => (
          <div
            key={index}
            className="bg-gray-800 border border-gray-700 rounded p-3"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-purple-400">
                Relevance: {(result.score * 100).toFixed(1)}%
              </span>
              {result.source && (
                <span className="text-xs text-gray-500">{result.source}</span>
              )}
            </div>
            <p className="text-gray-300 text-sm">
              {result.content.length > 150
                ? result.content.substring(0, 150) + "..."
                : result.content}
            </p>
          </div>
        ))}
    </div>
  </div>
);

interface ProgressStepItem {
  name: string;
  completed: boolean;
  current: boolean;
}

interface ProgressProps {
  title: string;
  progress: number;
  status: string;
  steps?: ProgressStepItem[];
}

const ProgressComponent: React.FC<ProgressProps> = (props) => (
  <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4 my-4">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-blue-400">⚙️</span>
      <span className="text-blue-300 font-medium">{props.title}</span>
    </div>

    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{props.status}</span>
        <span className="text-gray-400">{props.progress}%</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${props.progress}%` }}
        />
      </div>
    </div>

    {props.steps && (
      <div className="space-y-1">
        {props.steps.map((step: ProgressStepItem, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                step.completed
                  ? "bg-green-500 text-white"
                  : step.current
                  ? "bg-blue-500 text-white"
                  : "bg-gray-600 text-gray-400"
              }`}
            >
              {step.completed ? "✓" : step.current ? "•" : index + 1}
            </span>
            <span
              className={
                step.completed
                  ? "text-green-400"
                  : step.current
                  ? "text-blue-400"
                  : "text-gray-500"
              }
            >
              {step.name}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const UIComponentLoader: React.FC<UIComponentLoaderProps> = ({
  message,
  fallback = (
    <div className="text-gray-400 text-sm">Loading UI component...</div>
  ),
  className = "",
}) => {
  switch (message.type as UIMessageType) {
    case "code_generation":
      return (
        <div className={className}>
          <CodeGenerationComponent
            {...(message.props as unknown as CodeGenerationProps)}
          />
        </div>
      );
    case "file_operation":
      return (
        <div className={className}>
          <FileOperationComponent
            {...(message.props as unknown as FileOperationProps)}
          />
        </div>
      );
    case "knowledge_retrieval":
      return (
        <div className={className}>
          <KnowledgeRetrievalComponent
            {...(message.props as unknown as KnowledgeRetrievalProps)}
          />
        </div>
      );
    case "progress":
      return (
        <div className={className}>
          <ProgressComponent {...(message.props as unknown as ProgressProps)} />
        </div>
      );
    default:
      return <div className={className}>{fallback}</div>;
  }
};

export default UIComponentLoader;
