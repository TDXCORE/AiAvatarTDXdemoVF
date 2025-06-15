import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, Send, Settings, MicOff } from 'lucide-react';
import { VoiceSettings } from '@/types/voice';

interface VoiceControlsProps {
  isRecording: boolean;
  vadDetected: boolean;
  recordingDuration: number;
  isProcessing: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSendText: (text: string) => void;
  onOpenSettings: () => void;
  settings: VoiceSettings;
}

export function VoiceControls({
  isRecording,
  vadDetected,
  recordingDuration,
  isProcessing,
  onStartRecording,
  onStopRecording,
  onSendText,
  onOpenSettings,
}: VoiceControlsProps) {
  const [textInput, setTextInput] = useState('');

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput('');
    }
  };

  const handleSendText = () => {
    if (textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput('');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <footer className="bg-white border-t border-gray-200 px-4 py-3">
      {/* Recording Status Bar */}
      {(isRecording || isProcessing) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2 text-blue-700">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span>
                {isRecording 
                  ? `Recording: ${formatDuration(recordingDuration)}`
                  : 'Processing...'
                }
              </span>
            </div>
            {isProcessing && (
              <div className="flex items-center space-x-2 text-blue-600">
                <span>Processing...</span>
                <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Controls */}
      <div className="flex items-center space-x-3">
        {/* Text Input */}
        <div className="flex-1 relative">
          <Input
            type="text"
            placeholder="Type a message or hold mic to speak..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pr-12 bg-gray-100 rounded-full focus:bg-white focus:ring-2 focus:ring-[hsl(135,60%,50%)]"
            disabled={isRecording || isProcessing}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSendText}
            disabled={!textInput.trim() || isRecording || isProcessing}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-500 hover:text-gray-700"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        {/* Voice Recording Button */}
        <Button
          size="lg"
          onMouseDown={onStartRecording}
          onMouseUp={onStopRecording}
          onTouchStart={onStartRecording}
          onTouchEnd={onStopRecording}
          disabled={isProcessing}
          className={`w-12 h-12 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-[hsl(135,60%,50%)] hover:bg-[hsl(135,60%,40%)]'
          }`}
          title="Hold to record voice message"
        >
          {isRecording ? (
            <MicOff className="w-5 h-5 text-white" />
          ) : (
            <Mic className="w-5 h-5 text-white" />
          )}
        </Button>

        {/* Settings Button */}
        <Button
          variant="outline"
          size="lg"
          onClick={onOpenSettings}
          disabled={isRecording || isProcessing}
          className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200"
          title="Voice Settings"
        >
          <Settings className="w-5 h-5 text-gray-600" />
        </Button>
      </div>

      {/* Voice Activity Indicator */}
      {vadDetected && !isRecording && (
        <div className="flex items-center justify-center mt-2 space-x-2 text-xs text-gray-500">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Voice activity detected</span>
        </div>
      )}
    </footer>
  );
}
