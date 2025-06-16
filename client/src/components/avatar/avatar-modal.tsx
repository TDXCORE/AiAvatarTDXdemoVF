import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SimpleAvatarClient, SimpleAvatarState } from "@/lib/avatar-simple-client";
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
  const [avatarState, setAvatarState] = useState<SimpleAvatarState>({
    phase: 'initializing',
    isConnected: false,
    sessionId: null,
    previewUrl: null,
    error: null,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  
  const avatarClientRef = useRef<SimpleAvatarClient | null>(null);

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

      // Initialize Simple Avatar client
      avatarClientRef.current = new SimpleAvatarClient((newState) => {
        setAvatarState(prev => ({ ...prev, ...newState }));
      });

      // Create session
      await avatarClientRef.current.initialize();

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
    if (!avatarClientRef.current?.getSessionId()) {
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
          avatarSessionId: avatarClientRef.current.getSessionId()
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
        await avatarClientRef.current?.speak(chatResult.replyText);
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
      await avatarClientRef.current.setReady();
      setShowVideoPlayer(true);
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

  const ready = Boolean(avatarState.sessionId && avatarState.previewUrl);

  const renderAvatarDisplay = () => {
    if (showVideoPlayer && avatarState.sessionId) {
      return (
        <AvatarVideoPlayer 
          sessionId={avatarState.sessionId}
          onStreamReady={() => console.log('Video stream ready')}
        />
      );
    }
    
    // Show the avatar preview only when ready
    if (ready) {
      return (
        <AnimatedAvatarDisplay 
          avatarState={avatarState}
          className="w-full h-full"
        />
      );
    }
    
    // Show loading state while waiting for session and preview
    return (
      <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Conectando con Dr. Carlos Mendoza</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Estableciendo conexión segura...</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen && ready} onOpenChange={onClose}>
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
              {renderAvatarDisplay()}
            </div>
          </div>

          {/* Controls */}
          <div className="p-6 pt-0">
            <div className="flex items-center justify-center space-x-4">
              <Button
                variant={avatarState.phase === 'ready' ? "default" : "secondary"}
                onClick={handleStartCall}
                disabled={avatarState.phase !== 'ready'}
              >
                Iniciar Consulta
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
              {avatarState.phase === 'error' && `Error: ${avatarState.error}`}
              {isProcessing && "Procesando mensaje..."}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}