import { useEffect, useRef } from "react";

interface AvatarVideoPlayerProps {
  sessionId: string;
  onStreamReady?: () => void;
  className?: string;
}

export function AvatarVideoPlayer({ sessionId, onStreamReady, className }: AvatarVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && sessionId) {
      // El SDK de HeyGen inyecta automáticamente el srcObject del remoteStream
      // Este componente solo proporciona el elemento video para la inyección
      console.log('Video element ready for HeyGen SDK injection:', sessionId);
      onStreamReady?.();
    }
  }, [sessionId, onStreamReady]);

  return (
    <video 
      ref={videoRef}
      autoPlay
      playsInline
      muted={false}
      className={`w-full h-full object-cover ${className || ''}`}
      onLoadedMetadata={() => {
        console.log('Video metadata loaded for session:', sessionId);
      }}
      onError={(e) => {
        console.error('Video playback error:', e);
      }}
    />
  );
}