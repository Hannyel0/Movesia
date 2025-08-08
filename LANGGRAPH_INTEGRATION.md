# LangGraph useStream Integration Guide

## Overview

This guide documents the enhanced LangGraph `useStream` hook integration in the Movesia project. The implementation follows the latest LangGraph SDK patterns and best practices for React applications.

## Installation

The required packages are already installed in your project:

```json
{
  "@langchain/langgraph-sdk": "^0.0.105",
  "@langchain/core": "^0.3.66"
}
```

To install in a new project using pnpm:

```bash
pnpm add @langchain/langgraph-sdk @langchain/core
```

## Key Features Implemented

### 1. Enhanced TypeScript Support

```typescript
// Enhanced state type for better TypeScript support
type MovesiaState = {
  messages: Message[];
  context?: Record<string, unknown>;
};

// Custom event types for better type safety
type CustomEventType = {
  type: 'progress' | 'debug' | 'reasoning';
  payload: unknown;
};

// Interrupt type matching LangGraph SDK structure
interface InterruptType {
  type: string;
  message?: string;
  data?: unknown;
  value?: string | { content?: string; [key: string]: unknown };
}
```

### 2. Advanced useStream Configuration

```typescript
const thread = useStream<
  MovesiaState,
  {
    InterruptType: InterruptType;
    CustomEventType: CustomEventType;
    UpdateType: { messages: Message | Message[]; context?: Record<string, unknown> };
    ConfigurableType: { model?: string; temperature?: number };
  }
>({
  apiUrl: `${BACKEND_URL}/api`,
  assistantId: "agent",
  messagesKey: "messages",
  reconnectOnMount: true, // Auto-resume streams after page refresh
  // Event handlers for comprehensive lifecycle management
  onThreadId: setThreadId,
  onCreated: (run) => { /* Session management */ },
  onFinish: (_, run) => { /* Cleanup */ },
  onError: (err) => { /* Error handling */ },
  onCustomEvent: (event) => { /* Custom event processing */ },
  onUpdateEvent: (event) => { /* General updates */ },
  onMetadataEvent: (event) => { /* Metadata handling */ },
});
```

### 3. Optimistic Updates

Messages are displayed immediately when sent, providing better UX:

```typescript
thread.submit(
  { messages: [userMessage] },
  {
    streamResumable: true,
    optimisticValues: (prev) => {
      const prevMessages = prev.messages ?? [];
      const newMessages = [...prevMessages, userMessage];
      return { ...prev, messages: newMessages };
    }
  }
);
```

### 4. Conversation Branching

Users can navigate between different conversation branches:

```typescript
// Branch switcher component
function BranchSwitcher({ branch, branchOptions, onSelect }) {
  // Navigation between conversation branches
  // Shows current branch position (e.g., "2 / 3")
  // Allows switching with previous/next buttons
}

// Usage in message rendering
const meta = thread.getMessagesMetadata(message);
<BranchSwitcher
  branch={meta?.branch}
  branchOptions={meta?.branchOptions}
  onSelect={(branch) => thread.setBranch(branch)}
/>
```

### 5. Message Regeneration

AI messages can be regenerated using checkpoint-based branching:

```typescript
const handleRegenerateMessage = (message: Message) => {
  const meta = thread.getMessagesMetadata(message);
  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
  if (parentCheckpoint) {
    thread.submit(undefined, { checkpoint: parentCheckpoint });
  }
};
```

### 6. Interrupt Handling

Support for human-in-the-loop interactions:

```typescript
// Interrupt detection and UI
if (thread.interrupt) {
  return (
    <div>
      Interrupted! {thread.interrupt.value}
      <button onClick={() => thread.submit(undefined, { command: { resume: true } })}>
        Resume
      </button>
    </div>
  );
}
```

### 7. Session Management

Automatic session persistence and cleanup:

```typescript
onCreated: (run) => {
  if (typeof window !== 'undefined' && run.thread_id) {
    window.sessionStorage.setItem(`resume:${run.thread_id}`, run.run_id);
  }
},
onFinish: (_, run) => {
  if (typeof window !== 'undefined' && run?.thread_id) {
    window.sessionStorage.removeItem(`resume:${run.thread_id}`);
    // Optional cleanup endpoint call
  }
}
```

## Backend Integration

Your backend should be running a LangGraph server mounted at `/api`. The current configuration expects:

- **API URL**: `http://localhost:8000/api`
- **Assistant ID**: `"agent"`
- **Stream Mode**: `"messages"` (handled automatically by useStream)

### Required Backend Endpoints

The LangGraph server provides these endpoints automatically when mounted:

- `POST /api/threads` - Create new conversation threads
- `POST /api/threads/{thread_id}/runs` - Start new runs
- `GET /api/threads/{thread_id}/runs/{run_id}/stream` - Stream responses
- `POST /api/threads/{thread_id}/runs/{run_id}/interrupt` - Handle interrupts

## Error Handling

Comprehensive error handling is implemented:

```typescript
onError: (err) => {
  console.error('Stream error:', err);
  const errorMessage = err instanceof Error
    ? err.message
    : typeof err === 'string'
      ? err
      : 'An error occurred while streaming';
  setError(errorMessage);
}
```

## Event Logging

All events are logged for debugging:

```typescript
onCustomEvent: (event) => {
  console.log('Custom event received:', event);
  if (event.type === 'reasoning') {
    console.log('Agent reasoning:', event.payload);
  }
},
onUpdateEvent: (event) => {
  console.log('Update event:', event);
},
onMetadataEvent: (event) => {
  console.log('Metadata event:', event);
}
```

## UI Features

### Loading States
- Loading indicators during streaming
- Stop button to cancel ongoing streams
- Disabled input during processing

### Message Actions
- **Regenerate**: Create new response from checkpoint
- **Copy**: Copy message content to clipboard
- **Branch Navigation**: Switch between conversation branches

### Optimistic UI
- Immediate message display
- Smooth transitions
- Real-time streaming updates

## Best Practices

1. **Type Safety**: Use proper TypeScript types for all state and events
2. **Error Handling**: Implement comprehensive error boundaries
3. **Session Management**: Persist session data for recovery
4. **Optimistic Updates**: Show immediate feedback to users
5. **Event Logging**: Log all events for debugging
6. **Cleanup**: Properly clean up sessions and resources

## Troubleshooting

### Common Issues

1. **Connection Errors**: Ensure backend is running on `http://localhost:8000`
2. **Type Errors**: Verify all TypeScript interfaces match LangGraph SDK types
3. **Session Issues**: Check browser storage for session persistence
4. **Streaming Problems**: Verify LangGraph server is properly mounted at `/api`

### Debug Mode

Enable debug logging by checking browser console for:
- Custom events
- Update events
- Metadata events
- Error messages

## Future Enhancements

Potential improvements to consider:

1. **Generative UI**: Implement React component streaming
2. **Voice Integration**: Add speech-to-text/text-to-speech
3. **File Uploads**: Support document and image uploads
4. **Advanced Branching**: Visual branch tree representation
5. **Collaboration**: Multi-user conversation support

## Resources

- [LangGraph Documentation](https://docs.langchain.com/langgraph-platform/use-stream-react)
- [LangGraph SDK Reference](https://github.com/langchain-ai/langgraph)
- [React Hook Patterns](https://react.dev/reference/react)
