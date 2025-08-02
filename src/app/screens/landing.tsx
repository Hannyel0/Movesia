import ConnectionIndicator from '@/app/components/connection-indicator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

import axios from 'axios';
import { motion } from 'framer-motion';
import { Paperclip } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { FaArrowUp } from 'react-icons/fa6';
import TextareaAutosize from 'react-textarea-autosize';

interface Message {
  id: string;
  content: string;
  type: 'user' | 'bot';
  timestamp: Date;
  isLoading?: boolean;
}

// Backend API configuration
const BACKEND_URL = 'http://localhost:8000';

// Animation variants for the input container
const inputVariants = {
  landing: {
    top: '50%',
    y: '-50%',
    bottom: 'auto',
    width: '100%',
    maxWidth: '48rem', // max-w-3xl equivalent
  },
  chat: {
    top: 'auto',
    bottom: '1rem',
    y: 0,
    width: '100%',
    maxWidth: '45rem', // max-w-2xl equivalent (smaller at bottom)
  }
};

export function LandingScreen () {
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState('agent');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatMode, setIsChatMode] = useState(false);
  // key = botPlaceholder.id, value = array of reasoning steps
  const [reasoningMap, setReasoningMap] = useState<Record<string, { node: string; content: string; }[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (inputValue.trim()) {
      const userMessage: Message = {
        id: Date.now().toString(),
        content: inputValue.trim(),
        type: 'user',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInputValue('');
      
      // If this is the first message, transition to chat mode
      if (!isChatMode) {
        setIsChatMode(true);
      }
      
      // Create a placeholder for the bot's response
      const botPlaceholder: Message = {
        id: `bot-${Date.now()}`,
        content: '',
        type: 'bot',
        timestamp: new Date(),
        isLoading: true
      };
      
      setMessages(prev => [...prev, botPlaceholder]);
      
      // Check if we're in testing mode
      if (mode === 'testing') {
        // Simulate a delay and return hardcoded response
        setTimeout(() => {
          const testResponse = `This is a test response for your message: "${userMessage.content}". This response is hardcoded and doesn't use the backend. The current mode is set to "testing". You can switch back to "agent" or "ask" mode to use the actual AI backend.`;
          
          setMessages(prev => 
            prev.map(msg => 
              msg.id === botPlaceholder.id 
                ? { ...msg, content: testResponse, isLoading: false } 
                : msg
            )
          );
        }, 1000); // 1.5 second delay to simulate processing
        return; // Exit early, don't call backend
      }
      
      try {
        // Step 1: Send the message to the backend using axios
        const response = await axios.post(`${BACKEND_URL}/api/chat`, {
          message: userMessage.content,
          model: 'gpt-4o-mini' // Using default model
        });
        
        // Axios automatically throws errors for non-2xx responses
        // and parses JSON responses into response.data
        const sessionId = response.data.session_id;
        
        // Step 2: Connect to the streaming endpoint
        const placeholderId = botPlaceholder.id;
        setReasoningMap(prev => ({ ...prev, [placeholderId]: [] }));
        
        const es = new EventSource(`${BACKEND_URL}/api/chat/stream?session=${sessionId}`);
        
        let answerSoFar = "";
        
        // 1️⃣ intermediate "reasoning" events
        es.addEventListener("reasoning", (e) => {
          const update: Record<string, string> = JSON.parse(e.data);
          // flatten {LLM: "...", light_rag_retriever: "..."} into steps
          const steps = Object.entries(update).map(([node, content]) => ({ node, content }));
          setReasoningMap(prev => ({
            ...prev,
            [placeholderId]: [...(prev[placeholderId] || []), ...steps]
          }));
        });
        
        // 2️⃣ answer‐token events
        es.addEventListener("answer", (e) => {
          const { text } = JSON.parse(e.data);
          answerSoFar += text;
          setMessages(prev =>
            prev.map(m =>
              m.id === placeholderId
                ? { ...m, content: answerSoFar }
                : m
            )
          );
        });
        
        // 3️⃣ completion event
        es.addEventListener("completion", () => {
          es.close();
          // flip off loading after full answer
          setMessages(prev =>
            prev.map(m =>
              m.id === placeholderId
                ? { ...m, isLoading: false }
                : m
            )
          );
        });
        
        es.addEventListener('error', (event) => {
          console.error('SSE Error:', event);
          es.close();
          
          // Update the bot message to show the error
          setMessages(prev => 
            prev.map(msg => 
              msg.id === placeholderId 
                ? { ...msg, content: 'Sorry, there was an error processing your request.', isLoading: false } 
                : msg
            )
          );
        });
      } catch (error) {
        console.error('Error sending message:', error);
        
        // Update the bot message to show the error
        setMessages(prev => 
          prev.map(msg => 
            msg.id === botPlaceholder.id 
              ? { ...msg, content: 'Sorry, there was an error connecting to the agent.', isLoading: false } 
              : msg
          )
        );
      }
    }
  };

  const handleAttachment = () => {
    console.log('Attachment clicked');
    // Add your attachment logic here
  };

  return (
    <div
      className='h-full relative'
      style={{ backgroundColor: '#1B1B1B' }}
    >
      {/* Unity Connection Status Indicator */}
      <div className="absolute top-4 left-4 z-10">
        <ConnectionIndicator />
      </div>
      {/* Background Elements - Only show in landing mode */}
      {!isChatMode && (
        <>
          {/* Background Glow */}
          <div className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'>
            <div 
              style={{
                width: '120px',
                height: '120px',
                background: `radial-gradient(
                  circle at center,
                  rgba(39,39,39,0.45) 0%,
                  rgba(39,39,39,0.42) 15%,
                  rgba(39,39,39,0.38) 30%,
                  rgba(31,31,31,0.20) 50%,
                  rgba(31,31,31,0.15) 65%,
                  transparent 100%
                )`,
                filter: 'blur(80px)',
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none'
              }}
            />
          </div>

          {/* Title and Description */}
          <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center mb-8 -mt-32'>
            <h1 className='text-3xl font-bold text-white mb-2 tracking-tight'>Unity Agent</h1>
            <p className='text-gray-400 text-sm font-normal tracking-wide'>Ask me anything about your project...</p>
          </div>

          {/* Footer hint */}
          <div className='absolute bottom-20 left-1/2 -translate-x-1/2 text-center'>
            <p className='text-xs text-gray-500'>Press Enter to send • Shift + Enter for new line • {mode === 'agent' ? 'Agent Mode: Full AI assistance' : mode === 'ask' ? 'Ask Mode: Quick questions' : 'Testing Mode: Hardcoded responses'}</p>
          </div>
        </>
      )}

      {/* Chat Messages Container - Only show in chat mode */}
      {isChatMode && (
        <div className='absolute inset-0 flex flex-col h-full'>
          <div className='flex-1 overflow-y-auto px-6 pt-6 pb-32 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#282828] [&::-webkit-scrollbar-thumb:hover]:bg-[#3A3A3A] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:rounded-full'>
            <div className='w-full max-w-[40rem] mx-auto space-y-6'>
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
                  <div className={`${message.type === 'user' ? 'rounded-2xl px-4 py-2 bg-[#3A3A3A]' : 'px-0 py-0'} max-w-[80%] text-white`}>
                    {/* only for bot messages: show reasoning */}
                    {message.type === 'bot' && reasoningMap[message.id]?.length > 0 && (
                      <div className="mb-2 space-y-1 text-xs text-gray-400">
                        {reasoningMap[message.id].map((step, i) => (
                          <div key={i}>
                            <strong>{step.node}:</strong> {step.content}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* then the answer content */}
                    <div className='text-sm leading-relaxed tracking-wide font-normal whitespace-pre-wrap'>
                      {message.content}
                    </div>
                    
                    {/* loading dots */}
                    {message.isLoading && (
                      <div className="mt-2 flex space-x-1 justify-center">
                        <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Animated Input Container */}
      <motion.div
        className="absolute left-1/2 z-20 px-6"
        style={{ translateX: '-50%' }}
        variants={inputVariants}
        initial="landing"
        animate={isChatMode ? 'chat' : 'landing'}
        transition={{ type: 'tween', ease: 'easeInOut', duration: 0.5 }}
      >
        <motion.div 
          className={`shadow-lg transition-all duration-300 pb-3 overflow-hidden w-full max-w-[45rem] mx-auto ${
              inputValue.trim() 
                ? 'bg-[#2A2A2A]' 
                : 'bg-[#282828] hover:bg-[#2A2A2A]'
            }`}
          initial={{
            borderRadius: '1rem'
          }}
          animate={{
            borderRadius: isChatMode ? '1.5rem' : '1rem'
          }}
          transition={{ type: 'tween', ease: 'easeInOut', duration: 0.5 }}
        >
          {/* Text Input Area - Always on top */}
          <div className='relative'>
            <TextareaAutosize
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isChatMode ? 'Message Unity Agent...' : 'Ask anything...'}
              maxRows={5}
              className='w-full resize-none rounded-t-2xl px-4 py-4 pr-16 bg-transparent border-0 text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 text-base min-h-[56px]'
              style={{
                backgroundColor: 'transparent',
                borderColor: 'transparent'
              }}
            />
          </div>
          
          {/* Bottom Controls Container - Always below */}
          <div className='px-4 flex items-center justify-between'>
            {/* Mode Selector */}
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger 
                className='cursor-pointer w-20 bg-[#3A3A3A] border-0 text-gray-300 text-[11px] hover:text-white transition-colors rounded-full px-2.5 hover:bg-[#505050] focus:ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0'
                style={{ 
                  height: '19px',
                  minHeight: '19px',
                  lineHeight: '19px',
                  padding: '0 13px'
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className='bg-[#3A3A3A] border-gray-600 rounded-lg'>
                <SelectItem 
                  value='agent' 
                  className='text-white hover:bg-[#454545] focus:bg-[#454545] cursor-pointer text-xs'
                >
                  Agent
                </SelectItem>
                <SelectItem 
                  value='ask' 
                  className='text-white hover:bg-[#454545] focus:bg-[#454545] cursor-pointer text-xs'
                >
                  Ask
                </SelectItem>
                <SelectItem 
                  value='testing' 
                  className='text-white hover:bg-[#454545] focus:bg-[#454545] cursor-pointer text-xs'
                >
                  Testing
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Action Buttons */}
            <div className='flex gap-2'>
              <button
                onClick={handleAttachment}
                className='p-2 rounded-xl bg-[#3A3A3A] hover:bg-[#505050] transition-all duration-200'
              >
                <Paperclip className='text-gray-300 w-4 h-4 hover:text-white' />
              </button>
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  inputValue.trim()
                    ? 'bg-white hover:bg-gray-200 text-black shadow-lg'
                    : 'bg-[#404040] text-gray-500 cursor-not-allowed'
                }`}
              >
                <FaArrowUp className={`text-sm ${inputValue.trim() ? 'text-black' : 'text-gray-300'}`} />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
