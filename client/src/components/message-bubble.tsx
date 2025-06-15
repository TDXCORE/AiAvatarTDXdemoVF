import { ChatMessage } from '@/types/voice';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';
import { useState } from 'react';

interface MessageBubbleProps {
  message: ChatMessage;
  onPlayAudio?: (audioData: string) => void;
}

export function MessageBubble({ message, onPlayAudio }: MessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  
  const isUser = message.role === 'user';
  const timeString = message.timestamp.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const handlePlayAudio = () => {
    if (message.audioData && onPlayAudio) {
      setIsPlaying(!isPlaying);
      onPlayAudio(message.audioData);
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 shadow-sm ${
          isUser
            ? 'bg-[hsl(135,60%,90%)] rounded-l-2xl rounded-br-lg'
            : 'bg-white rounded-r-2xl rounded-bl-lg border border-gray-100'
        }`}
      >
        {/* Voice message controls */}
        {message.isVoice && message.audioData && (
          <div className="flex items-center space-x-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePlayAudio}
              className="p-1 h-auto text-gray-700 hover:text-gray-900"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <div className="flex items-center space-x-1 flex-1">
              <div className="bg-gray-300 h-1 rounded flex-1"></div>
              <span className="text-xs text-gray-600">
                {message.metadata?.transcriptionDuration 
                  ? `${Math.floor(message.metadata.transcriptionDuration)}s`
                  : '0:15'
                }
              </span>
            </div>
          </div>
        )}

        {/* Message content */}
        <p className={`text-gray-800 ${message.isVoice ? 'text-sm italic' : ''}`}>
          {message.isVoice && isUser ? `"${message.content}"` : message.content}
        </p>

        {/* Timestamp and status */}
        <div className={`flex items-center mt-1 space-x-1 ${
          isUser ? 'justify-end' : 'justify-start'
        }`}>
          <span className="text-xs text-gray-500">{timeString}</span>
          {isUser && (
            <div className="flex space-x-1">
              <div className="w-3 h-3 flex items-center justify-center">
                <svg viewBox="0 0 16 15" className="w-full h-full">
                  <path
                    d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l3.61 3.463c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.064-.512z"
                    fill="#4fc3f7"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
