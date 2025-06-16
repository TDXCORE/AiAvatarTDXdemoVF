import { useEffect, useState } from "react";
import { SimpleAvatarState } from "@/lib/avatar-simple-client";

interface AnimatedAvatarDisplayProps {
  avatarState: SimpleAvatarState;
  className?: string;
}

export function AnimatedAvatarDisplay({ avatarState, className }: AnimatedAvatarDisplayProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (avatarState.phase === 'speaking') {
      setIsAnimating(true);
    } else {
      setIsAnimating(false);
    }
  }, [avatarState.phase]);

  const renderStateOverlay = () => {
    switch (avatarState.phase) {
      case 'initializing':
        return (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <p className="text-sm">Inicializando Dr. Carlos...</p>
            </div>
          </div>
        );

      case 'listening':
        return (
          <div className="absolute bottom-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></div>
            Escuchando...
          </div>
        );

      case 'speaking':
        return (
          <div className="absolute bottom-4 left-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce mr-2"></div>
            Dr. Carlos está hablando...
          </div>
        );

      case 'error':
        return (
          <div className="absolute inset-0 bg-red-500/90 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="text-4xl mb-2">⚠️</div>
              <p className="text-sm mb-2">Error de conexión</p>
              <p className="text-xs opacity-80">{avatarState.error}</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!avatarState.previewUrl) {
    return (
      <div className="relative w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
            <span className="text-2xl">👨‍⚕️</span>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Dr. Carlos Mendoza</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Psicólogo Clínico</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full rounded-lg overflow-hidden ${className || ''}`}>
      {/* Dr. Carlos Mendoza Avatar with HeyGen Validation */}
      <div className="relative w-full h-full">
        <img
          src={avatarState.previewUrl || '/api/avatar/preview/Dexter_Doctor_Standing2_public'}
          alt="Dr. Carlos Mendoza"
          className={`w-full h-full object-cover transition-all duration-300 ${
            isAnimating 
              ? 'scale-105 brightness-110 animate-pulse' 
              : 'scale-100 brightness-100'
          }`}
          onLoad={() => {
            console.log('Dr. Carlos Mendoza avatar loaded successfully');
          }}
          onError={(e) => {
            console.warn('Avatar preview failed, using fallback');
            const target = e.target as HTMLImageElement;
            target.src = '/api/avatar/preview/Dexter_Doctor_Standing2_public';
          }}
        />
        
        {/* Speaking animation overlay */}
        {isAnimating && (
          <div className="absolute inset-0 bg-blue-400/10 animate-pulse pointer-events-none"></div>
        )}
      </div>

      {/* State-specific overlays */}
      {renderStateOverlay()}
      
      {/* Connection indicator */}
      <div className="absolute top-4 right-4">
        <div className={`w-3 h-3 rounded-full ${
          avatarState.isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} />
      </div>

      {/* Speaking animation rings */}
      {isAnimating && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-4 border-2 border-blue-400/30 rounded-full animate-ping"></div>
          <div className="absolute inset-8 border-2 border-blue-400/20 rounded-full animate-ping animation-delay-75"></div>
          <div className="absolute inset-12 border-2 border-blue-400/10 rounded-full animate-ping animation-delay-150"></div>
        </div>
      )}
    </div>
  );
}