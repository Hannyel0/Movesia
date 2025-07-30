import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

import { Paperclip } from 'lucide-react';
import { useState } from 'react';
import { FaArrowUp } from 'react-icons/fa6';
import TextareaAutosize from 'react-textarea-autosize';

export function LandingScreen () {
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState('agent');

  const handleSend = () => {
    if (inputValue.trim()) {
      console.log('Sending:', inputValue, 'Mode:', mode);
      // Add your send logic here
      setInputValue('');
    }
  };

  const handleAttachment = () => {
    console.log('Attachment clicked');
    // Add your attachment logic here
  };

  return (
    <div
      className='h-full flex items-center justify-center'
      style={{ backgroundColor: '#1B1B1B' }}
    >
      <div className='w-full max-w-3xl px-6'>
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

        <div className='text-center mb-8'>
          <h1 className='text-3xl font-semibold text-white mb-2'>Unity Agent</h1>
          <p className='text-gray-400 text-sm'>Ask me anything about your project...</p>
        </div>
        
        <div className='relative'>
          {/* Input Container */}
          <div 
            className='relative rounded-xl shadow-md pb-3 z-10'
            style={{
              backgroundColor: '#282828'
            }}
          >
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
                placeholder='Ask anything...'
                maxRows={5}
                className='w-full resize-none rounded-t-2xl px-4 py-4 pr-16 bg-transparent border-0 text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 text-base min-h-[56px]'
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'transparent'
                }}
              />
            </div>
            
            {/* Bottom Controls Container */}
            <div className='px-4 flex items-center justify-between'>
              {/* Mode Selector - Integrated inside container */}
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
                  className='p-2 rounded-xl bg-[#3A3A3A] hover:bg-[#505050] disabled:bg-[#404040] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200'
                >
                  <FaArrowUp className='text-gray-300 text-sm hover:text-white disabled:text-gray-500' />
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer hint */}
        <div className='text-center mt-4'>
          <p className='text-xs text-gray-500'>Press Enter to send • Shift + Enter for new line • {mode === 'agent' ? 'Agent Mode: Full AI assistance' : 'Ask Mode: Quick questions'}</p>
        </div>
      </div>
    </div>
  );
}
