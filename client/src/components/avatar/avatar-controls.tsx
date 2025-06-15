import { Mic, MicOff, PhoneOff, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarState } from "@/types/avatar";

interface AvatarControlsProps {
  avatarState: AvatarState;
  onEndCall: () => void;
  onMuteToggle: () => void;
  onSettingsOpen?: () => void;
  isMuted: boolean;
  isRecording: boolean;
}

export function AvatarControls({ 
  avatarState, 
  onEndCall, 
  onMuteToggle, 
  onSettingsOpen,
  isMuted,
  isRecording 
}: AvatarControlsProps) {
  
  const isCallActive = avatarState.isConnected && avatarState.phase !== 'error';

  return (
    <div className="flex items-center justify-center space-x-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {/* Mute/Unmute Button */}
      <Button
        onClick={onMuteToggle}
        disabled={!isCallActive}
        variant={isMuted ? "destructive" : "default"}
        size="lg"
        className="rounded-full p-3"
      >
        {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </Button>

      {/* End Call Button */}
      <Button
        onClick={onEndCall}
        variant="destructive"
        size="lg"
        className="rounded-full p-4 bg-red-500 hover:bg-red-600"
      >
        <PhoneOff className="w-6 h-6" />
      </Button>

      {/* Settings Button */}
      {onSettingsOpen && (
        <Button
          onClick={onSettingsOpen}
          variant="outline"
          size="lg"
          className="rounded-full p-3"
        >
          <Settings className="w-6 h-6" />
        </Button>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="flex items-center space-x-2 px-3 py-2 bg-red-100 dark:bg-red-900 rounded-full">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-red-700 dark:text-red-300">Grabando</span>
        </div>
      )}

      {/* Connection Status */}
      <div className="flex items-center space-x-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-full">
        <div className={`w-2 h-2 rounded-full ${
          avatarState.isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <span className="text-xs text-gray-600 dark:text-gray-300">
          {avatarState.isConnected ? 'Conectado' : 'Desconectado'}
        </span>
      </div>
    </div>
  );
}