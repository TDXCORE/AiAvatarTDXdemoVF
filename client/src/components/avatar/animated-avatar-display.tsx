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

  const isValidPreview = (url?: string) => {
    return !!url && (url.startsWith('/api/avatar/preview/') || /\.(png|jpg|jpeg|webp|gif|svg)$/.test(url));
  };

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

  // Show HeyGen streaming interface only for real HeyGen sessions
  if (avatarState.sessionId) {
    console.log('Displaying avatar for session:', avatarState.sessionId);

    // Check if it's a real HeyGen session or fallback
    const isHeyGenSession = !avatarState.sessionId.startsWith('fallback_');

    return (
      <div className={`relative w-full h-full rounded-lg overflow-hidden ${className || ''}`}>
        {isHeyGenSession ? (
          /* Real HeyGen Streaming Avatar */
          <div className="relative w-full h-full bg-black">
            <iframe
              src={`https://app.heygen.com/embed/v1/${avatarState.sessionId}`}
              className={`w-full h-full border-0 transition-all duration-300 ${
                isAnimating 
                  ? 'scale-105 brightness-110' 
                  : 'scale-100 brightness-100'
              }`}
              title="Dr. Carlos Mendoza - Avatar en Streaming"
              allow="camera; microphone; autoplay; fullscreen"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              onLoad={() => {
                console.log('HeyGen streaming avatar loaded successfully');
              }}
              onError={() => {
                console.warn('HeyGen streaming failed');
              }}
            />

            {/* Speaking animation overlay */}
            {isAnimating && (
              <div className="absolute inset-0 bg-blue-400/10 animate-pulse pointer-events-none"></div>
            )}

            {/* HeyGen Session Indicator */}
            <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs">
              ✓ HeyGen Live
            </div>
          </div>
        ) : (
          /* Fallback Avatar - Static Image with Animations */
          <div className="relative w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
            {/* Professional Avatar Background */}
            <div className="relative w-64 h-80 rounded-lg bg-white shadow-2xl overflow-hidden">
              {/* Avatar SVG - Always show professional doctor */}
              <div className={`w-full h-full flex items-center justify-center transition-all duration-300 ${
                isAnimating ? 'scale-105 brightness-110' : 'scale-100 brightness-100'
              }`}>
                <svg width="100%" height="100%" viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{stopColor:"#1D4ED8", stopOpacity:1}} />
                      <stop offset="100%" style={{stopColor:"#3B82F6", stopOpacity:1}} />
                    </linearGradient>
                    <linearGradient id="suit" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{stopColor:"#1F2937", stopOpacity:1}} />
                      <stop offset="100%" style={{stopColor:"#374151", stopOpacity:1}} />
                    </linearGradient>
                  </defs>

                  {/* Background */}
                  <rect width="400" height="500" fill="url(#bg)" />

                  {/* Doctor Body */}
                  <ellipse cx="200" cy="450" rx="120" ry="50" fill="url(#suit)" />

                  {/* White Coat */}
                  <path d="M120 320 L280 320 L290 480 L110 480 Z" fill="white" stroke="#E5E7EB" strokeWidth="2"/>

                  {/* Stethoscope */}
                  <circle cx="180" cy="350" r="15" fill="none" stroke="#10B981" strokeWidth="3"/>
                  <path d="M180 335 Q200 300 220 330" fill="none" stroke="#10B981" strokeWidth="3"/>

                  {/* Head */}
                  <circle cx="200" cy="200" r="80" fill="#FBBF24" />

                  {/* Hair */}
                  <path d="M140 150 Q200 120 260 150 Q250 140 200 130 Q150 140 140 150" fill="#92400E" />

                  {/* Eyes */}
                  <circle cx="175" cy="190" r="8" fill="white" />
                  <circle cx="225" cy="190" r="8" fill="white" />
                  <circle cx="175" cy="190" r="4" fill="black" />
                  <circle cx="225" cy="190" r="4" fill="black" />

                  {/* Nose */}
                  <ellipse cx="200" cy="210" rx="6" ry="10" fill="#F59E0B" />

                  {/* Mouth */}
                  <path d="M185 230 Q200 240 215 230" fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round"/>

                  {/* Glasses */}
                  <circle cx="175" cy="190" r="20" fill="none" stroke="#374151" strokeWidth="2"/>
                  <circle cx="225" cy="190" r="20" fill="none" stroke="#374151" strokeWidth="2"/>
                  <line x1="195" y1="190" x2="205" y2="190" stroke="#374151" strokeWidth="2"/>

                  {/* Speaking indicator */}
                  {isAnimating && (
                    <>
                      <circle cx="260" cy="180" r="3" fill="#3B82F6" opacity="0.8">
                        <animate attributeName="r" values="3;8;3" dur="1s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1s" repeatCount="indefinite"/>
                      </circle>
                      <circle cx="275" cy="170" r="2" fill="#3B82F6" opacity="0.6">
                        <animate attributeName="r" values="2;6;2" dur="1.2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1.2s" repeatCount="indefinite"/>
                      </circle>
                      <circle cx="285" cy="165" r="1" fill="#3B82F6" opacity="0.4">
                        <animate attributeName="r" values="1;4;1" dur="0.8s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="0.8s" repeatCount="indefinite"/>
                      </circle>
                    </>
                  )}
                </svg>
              </div>

              {/* Professional overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-600/90 to-transparent p-4">
                <h3 className="text-white font-semibold text-lg">Dr. Carlos Mendoza</h3>
                <p className="text-blue-100 text-sm">Psicólogo Clínico</p>
              </div>
            </div>
          </div>
        )}

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

  // Loading state while waiting for session
  return (
    <div className="relative w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900 rounded-lg flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Conectando con Dr. Carlos Mendoza</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">Estableciendo conexión de streaming...</p>
      </div>
    </div>
  );
}