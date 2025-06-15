import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Square } from 'lucide-react';

interface VoiceRecorderProps {
  isOpen: boolean;
  recordingDuration: number;
  onCancel: () => void;
  onStop: () => void;
}

export function VoiceRecorder({ 
  isOpen, 
  recordingDuration, 
  onCancel, 
  onStop 
}: VoiceRecorderProps) {
  const [audioLevels, setAudioLevels] = useState([4, 8, 12, 6, 10]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isOpen) {
      // Simulate audio visualization
      interval = setInterval(() => {
        setAudioLevels(prev => 
          prev.map(() => Math.floor(Math.random() * 16) + 4)
        );
      }, 150);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
        {/* Recording Icon */}
        <div className="mb-6">
          <div className="w-20 h-20 bg-red-500 rounded-full mx-auto flex items-center justify-center animate-pulse">
            <div className="w-8 h-8 bg-white rounded-full"></div>
          </div>
        </div>
        
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Listening...</h3>
        <p className="text-gray-600 text-sm mb-2">Speak clearly into your microphone</p>
        <p className="text-sm text-gray-500 mb-6">{formatDuration(recordingDuration)}</p>
        
        {/* Audio Visualization */}
        <div className="flex items-center justify-center space-x-1 mb-6 h-6">
          {audioLevels.map((level, index) => (
            <div
              key={index}
              className="w-1 bg-[hsl(135,60%,50%)] rounded-full transition-all duration-150"
              style={{ height: `${level}px` }}
            />
          ))}
        </div>
        
        {/* Controls */}
        <div className="flex space-x-4">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={onStop}
            className="flex-1 bg-[hsl(135,60%,50%)] hover:bg-[hsl(135,60%,40%)] py-3 px-4 rounded-xl"
          >
            <Square className="w-4 h-4 mr-2" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
