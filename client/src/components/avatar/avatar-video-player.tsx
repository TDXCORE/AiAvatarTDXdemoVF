import { useEffect, useRef } from "react";
import { AvatarState } from "@/types/avatar";
import { Loader2, AlertCircle } from "lucide-react";

interface AvatarVideoPlayerProps {
  avatarState: AvatarState;
  onVideoReady?: (videoElement: HTMLVideoElement) => void;
}

export function AvatarVideoPlayer({ avatarState, onVideoReady }: AvatarVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && onVideoReady) {
      onVideoReady(videoRef.current);
    }
  }, [onVideoReady]);

  const renderStateOverlay = () => {
    switch (avatarState.phase) {
      case 'initializing':
      case 'connecting':
        return (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center text-white">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">
                {avatarState.phase === 'initializing' ? 'Iniciando sesión...' : 'Conectando con Dr. Carlos...'}
              </p>
              {avatarState.progress > 0 && (
                <div className="w-32 bg-gray-600 rounded-full h-2 mt-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${avatarState.progress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );

      case 'listening':
        return (
          <div className="absolute bottom-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2" />
            Escuchando...
          </div>
        );

      case 'speaking':
        return (
          <div className="absolute bottom-4 left-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce mr-2" />
            Dr. Carlos está hablando...
          </div>
        );

      case 'error':
        return (
          <div className="absolute inset-0 bg-red-500/90 flex items-center justify-center">
            <div className="text-center text-white">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm mb-2">Error de conexión</p>
              <p className="text-xs opacity-80">{avatarState.error}</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };



  return (
    <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        playsInline
        muted={false}
      />
      
      {renderStateOverlay()}
      
      {/* Connection indicator */}
      <div className="absolute top-4 right-4">
        <div className={`w-3 h-3 rounded-full ${
          avatarState.isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} />
      </div>
    </div>
  );
}