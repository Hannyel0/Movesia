import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

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
}

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim()) {
      const userMessage: Message = {
        id: Date.now().toString(),
        content: inputValue.trim(),
        type: 'user',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInputValue('');
      
      // Transition to chat mode on first message
      if (!isChatMode) {
        setIsChatMode(true);
      }

      // Simulate bot response after a short delay
      setTimeout(() => {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: "I'm a demo bot response. In a real implementation, this would be connected to your AI service.",
          type: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMessage]);
      }, 2000);
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
            <p className='text-xs text-gray-500'>Press Enter to send • Shift + Enter for new line • {mode === 'agent' ? 'Agent Mode: Full AI assistance' : 'Ask Mode: Quick questions'}</p>
          </div>
        </>
      )}

      {/* Chat Messages Container - Only show in chat mode */}
      {isChatMode && (
        <div className='absolute inset-0 flex flex-col'>
          <div className='flex-1 overflow-y-auto px-6 pt-6 pb-24'>
            <div className='max-w-[45rem] mx-auto space-y-6'>
              {messages.map((message) => (
                <div key={message.id} className={`${message.type === 'user' ? 'flex justify-end' : ''}`}>
                  {message.type === 'user'
                    ? (
                      /* User Message - Light gray bubble aligned right */
                      <div className='bg-[#2A2A2A] text-white rounded-2xl px-4 py-3 max-w-[80%] rounded-br-md'>
                        <div className='text-sm leading-relaxed tracking-wide font-normal whitespace-pre-wrap'>
                          {message.content}
                        </div>
                      </div>
                      )
                    : (
                  /* Agent Message - Plain text aligned left */
                      <div className='text-white text-sm leading-relaxed tracking-wide font-normal whitespace-pre-wrap max-w-[80%]'>
                        {message.content}
                      </div>
                      )}
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
          className={` shadow-lg transition-all duration-300 pb-3 overflow-hidden ${
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
