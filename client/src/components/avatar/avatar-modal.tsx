import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StreamingAvatarClient, StreamingAvatarState } from "@/lib/streaming-avatar-client";
import { AnimatedAvatarDisplay } from "./animated-avatar-display";
import { AvatarVideoPlayer } from "./avatar-video-player";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { AudioUtils } from "@/lib/audio-utils";
import { TranscriptionResult } from "@/types/voice";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, X } from "lucide-react";

interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onMessageReceived?: (userMessage: string, aiResponse: string) => void;
}

export function AvatarModal({ isOpen, onClose, sessionId, onMessageReceived }: AvatarModalProps) {
  const [avatarState, setAvatarState] = useState<StreamingAvatarState>({
    phase: 'initializing',
    isConnected: false,
    sessionToken: null,
    error: null,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  
  const avatarClientRef = useRef<StreamingAvatarClient | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Audio recording functionality
  const { startRecording, stopRecording, isRecording } = useAudioRecorder({
    onRecordingStop: async (result) => {
      if (result.audioBlob) {
        await processAudioMessage(result.audioBlob);
      }
    },
  });

  useEffect(() => {
    if (isOpen) {
      initializeAvatarSession();
    } else {
      cleanup();
    }

    return () => {
      cleanup();
    };
  }, [isOpen]);

  const initializeAvatarSession = async () => {
    try {
      setAvatarState(prev => ({ ...prev, phase: 'initializing' }));

      if (!videoRef.current) {
        throw new Error('Video element not available');
      }

      // Initialize StreamingAvatar client
      avatarClientRef.current = new StreamingAvatarClient((newState) => {
        setAvatarState(prev => ({ ...prev, ...newState }));
      });

      // Initialize with video element
      await avatarClientRef.current.initialize(videoRef.current);

    } catch (error) {
      console.error('Failed to initialize avatar session:', error);
      setAvatarState(prev => ({ 
        ...prev, 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Connection failed',
        isConnected: false
      }));
    }
  };

  const processAudioMessage = async (audioBlob: Blob) => {
    if (!avatarClientRef.current?.isReady()) {
      console.warn('No active avatar session for audio processing');
      return;
    }

    setIsProcessing(true);
    setAvatarState(prev => ({ ...prev, phase: 'listening' }));

    try {
      // Transcribe audio
      const formData = new FormData();
      const wavBlob = await AudioUtils.convertToWav(audioBlob);
      formData.append('audio', wavBlob, 'recording.wav');
      formData.append('language', 'es');

      const transcriptionResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        throw new Error('Transcription failed');
      }

      const transcriptionResult: TranscriptionResult = await transcriptionResponse.json();
      
      if (!transcriptionResult.transcription || transcriptionResult.transcription.trim().length === 0) {
        console.warn('No text transcribed from audio');
        return;
      }

      console.log('User said:', transcriptionResult.transcription);

      // Get AI response
      const chatResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputText: transcriptionResult.transcription,
          sessionId: sessionId,
          isAvatarCall: true,
          avatarSessionId: avatarClientRef.current.getSessionToken()
        }),
      });

      if (!chatResponse.ok) {
        throw new Error('Chat response failed');
      }

      const chatResult = await chatResponse.json();
      
      if (chatResult.replyText) {
        console.log('AI Response:', chatResult.replyText);
        
        // Pass messages to parent chat interface
        onMessageReceived?.(transcriptionResult.transcription, chatResult.replyText);
        
        // Send to avatar for speech
        await avatarClientRef.current?.speakAgentResponse(chatResult.replyText);
      } else {
        throw new Error('No response from AI agent');
      }

    } catch (error) {
      console.error('Error processing audio message:', error);
      setAvatarState(prev => ({ 
        ...prev, 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Processing failed' 
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartCall = async () => {
    if (!avatarClientRef.current) return;
    
    try {
      setAvatarState(prev => ({ ...prev, phase: 'listening', isConnected: true }));
      
      // Send initial greeting
      await avatarClientRef.current.speakAgentResponse("¡Hola! Soy el Dr. Carlos Mendoza. ¿En qué puedo ayudarte hoy?");
    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };

  const handleEndCall = async () => {
    if (!avatarClientRef.current) return;
    
    try {
      await avatarClientRef.current.close();
      setShowVideoPlayer(false);
      onClose();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
  };

  const handleStartRecording = () => {
    if (!isMuted && avatarState.phase === 'ready') {
      startRecording();
    }
  };

  const handleStopRecording = () => {
    if (isRecording) {
      stopRecording();
    }
  };

  const cleanup = async () => {
    if (avatarClientRef.current) {
      try {
        await avatarClientRef.current.close();
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
      avatarClientRef.current = null;
    }
  };

  const ready = Boolean(avatarState.sessionToken) && avatarState.phase !== 'error';

  const renderAvatarDisplay = () => {
    return (
      <div className="w-full h-full relative">
        {/* Video element for StreamingAvatar */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover bg-black rounded-lg"
          autoPlay
          playsInline
          muted={false}
        />
        
        {/* State overlays */}
        {avatarState.phase === 'initializing' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <p className="text-sm">Inicializando Dr. Carlos...</p>
            </div>
          </div>
        )}
        
        {avatarState.phase === 'connecting' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <p className="text-sm">Conectando...</p>
            </div>
          </div>
        )}
        
        {avatarState.phase === 'speaking' && (
          <div className="absolute bottom-4 left-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce mr-2"></div>
            Dr. Carlos está hablando...
          </div>
        )}
        
        {avatarState.phase === 'listening' && (
          <div className="absolute bottom-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></div>
            Escuchando...
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] p-0">
        <DialogHeader className="p-6 pb-0 flex flex-row items-center justify-between">
          <div>
            <DialogTitle>Dr. Carlos Mendoza</DialogTitle>
            <DialogDescription>
              Consulta con inteligencia artificial especializada en psicología
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 flex flex-col">
          {/* Avatar Display */}
          <div className="flex-1 p-6">
            <div className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              {avatarState.phase === 'error' ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-4">⚠️</div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      Error de Conexión
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      {avatarState.error || 'No se pudo conectar con el servicio de avatar'}
                    </p>
                    <Button onClick={initializeAvatarSession} variant="outline">
                      Reintentar Conexión
                    </Button>
                  </div>
                </div>
              ) : (
                renderAvatarDisplay()
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="p-6 pt-0">
            <div className="flex items-center justify-center space-x-4">
              <Button
                variant={avatarState.sessionToken ? "default" : "secondary"}
                onClick={handleStartCall}
                disabled={!avatarState.sessionToken || avatarState.phase === 'error'}
              >
                {avatarState.sessionToken ? 'Iniciar Consulta' : 'Conectando...'}
              </Button>
              
              <Button
                variant={isRecording ? "destructive" : "outline"}
                size="icon"
                onMouseDown={handleStartRecording}
                onMouseUp={handleStopRecording}
                onTouchStart={handleStartRecording}
                onTouchEnd={handleStopRecording}
                disabled={isMuted || isProcessing}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>

              <Button
                variant={isMuted ? "destructive" : "outline"}
                onClick={handleMuteToggle}
              >
                {isMuted ? "Desactivar Silencio" : "Silenciar"}
              </Button>

              <Button
                variant="outline"
                onClick={handleEndCall}
                disabled={avatarState.phase === 'initializing'}
              >
                Finalizar
              </Button>
            </div>
            
            {/* Status */}
            <div className="text-center mt-4 text-sm text-gray-600 dark:text-gray-400">
              {avatarState.phase === 'initializing' && "Conectando con Dr. Carlos..."}
              {avatarState.phase === 'ready' && "Listo para conversar"}
              {avatarState.phase === 'listening' && "Escuchando..."}
              {avatarState.phase === 'speaking' && "Dr. Carlos está respondiendo..."}
              {avatarState.phase === 'error' && "Error de conexión - Usando modo de respaldo"}
              {isProcessing && "Procesando mensaje..."}
              {avatarState.sessionToken && avatarState.phase !== 'error' && avatarState.phase !== 'initializing' && !isProcessing && "Sistema listo"}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}