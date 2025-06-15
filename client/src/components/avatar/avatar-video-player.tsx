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

  // Handle fallback mode - show voice chat interface
  if (avatarState.sessionId?.startsWith('fallback_') || avatarState.error?.includes('modo de chat por voz')) {
    return (
      <div className="relative w-full h-full bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-800 dark:to-gray-900 rounded-lg overflow-hidden border-2 border-green-200 dark:border-green-800">
        <div className="flex items-center justify-center h-full p-6">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Dr. Carlos Mendoza</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Psicólogo Clínico</p>
            <div className="bg-green-100 dark:bg-green-900 px-3 py-1 rounded-full inline-block mb-4">
              <p className="text-xs text-green-700 dark:text-green-300">Chat por voz disponible</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
              El video no está disponible temporalmente. Utiliza los controles de voz para iniciar tu consulta.
            </p>
          </div>
        </div>
        
        {/* Connection indicator */}
        <div className="absolute top-4 right-4">
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>

        {renderStateOverlay()}
      </div>
    );
  }

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