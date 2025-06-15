import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AvatarState } from "@/types/avatar";
import { HeyGenStreamingClient } from "@/lib/heygen-client";
import { AvatarPreview } from "./avatar-preview";
import { AvatarVideoPlayer } from "./avatar-video-player";
import { AvatarControls } from "./avatar-controls";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import { AudioUtils } from "@/lib/audio-utils";
import { TranscriptionResult } from "@/types/voice";

interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

export function AvatarModal({ isOpen, onClose, sessionId }: AvatarModalProps) {
  const [avatarState, setAvatarState] = useState<AvatarState>({
    phase: 'initializing',
    isConnected: false,
    sessionId: null,
    streamUrl: null,
    previewUrl: null,
    error: null,
    progress: 0,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const heygenClientRef = useRef<HeyGenStreamingClient | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Audio recording functionality
  const { startRecording, stopRecording, isRecording } = useAudioRecorder({
    onRecordingStop: async (result) => {
      if (result.audioBlob) {
        await processAudioMessage(result.audioBlob);
      }
    },
  });

  // Voice activity detection
  const { vadDetected } = useVoiceActivity({
    sensitivity: 70,
    onSpeechStart: () => {
      if (!isRecording && !isMuted && avatarState.phase === 'ready') {
        startRecording();
      }
    },
    onSpeechEnd: () => {
      if (isRecording) {
        stopRecording();
      }
    },
  });

  useEffect(() => {
    if (isOpen) {
      initializeAvatarSession();
    } else {
      const cleanupAsync = async () => {
        await cleanup();
      };
      cleanupAsync();
    }

    return () => {
      const cleanupAsync = async () => {
        await cleanup();
      };
      cleanupAsync();
    };
  }, [isOpen]);

  const initializeAvatarSession = async () => {
    try {
      setAvatarState(prev => ({ ...prev, phase: 'preview', progress: 10 }));
      
      // Initialize HeyGen client
      heygenClientRef.current = new HeyGenStreamingClient((newState) => {
        setAvatarState(prev => ({ ...prev, ...newState }));
      });

      // Create session
      const sessionData = await heygenClientRef.current.initializeSession();
      
      // Wait a bit for smooth transition
      setTimeout(() => {
        setAvatarState(prev => ({ 
          ...prev, 
          phase: 'ready',
          progress: 100,
          ...sessionData 
        }));
      }, 1500);

    } catch (error) {
      console.error('Failed to initialize avatar session:', error);
      setAvatarState(prev => ({ 
        ...prev, 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Connection failed' 
      }));
    }
  };

  const processAudioMessage = async (audioBlob: Blob) => {
    if (!heygenClientRef.current?.getSessionId()) return;

    setIsProcessing(true);
    setAvatarState(prev => ({ ...prev, phase: 'listening' }));

    try {
      // Transcribe audio
      const formData = new FormData();
      const wavBlob = await AudioUtils.convertToWav(audioBlob);
      formData.append('audio', wavBlob, 'recording.wav');
      formData.append('language', 'es');
      
      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!transcribeResponse.ok) {
        throw new Error('Transcription failed');
      }
      
      const transcriptionResult: TranscriptionResult = await transcribeResponse.json();
      
      // Send to psychological agent with avatar flag
      const agentResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputText: transcriptionResult.transcription,
          sessionId,
          isVoice: true,
          isAvatarCall: true,
          avatarSessionId: heygenClientRef.current.getSessionId(),
          vadDetected: vadDetected,
        }),
      });

      if (!agentResponse.ok) {
        throw new Error('Agent processing failed');
      }

      const result = await agentResponse.json();
      
      // Avatar will receive the response automatically via HeyGen
      // The response was already sent to the avatar in the backend
      
      setAvatarState(prev => ({ ...prev, phase: 'speaking' }));
      
      // Return to ready state after estimated speech time
      const estimatedSpeechTime = result.replyText.length * 50;
      setTimeout(() => {
        setAvatarState(prev => ({ ...prev, phase: 'ready' }));
      }, Math.max(estimatedSpeechTime, 2000));

    } catch (error) {
      console.error('Error processing audio message:', error);
      setAvatarState(prev => ({ 
        ...prev, 
        phase: 'error', 
        error: 'Failed to process message' 
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEndCall = () => {
    cleanup();
    onClose();
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
  };

  const handleVideoReady = (videoElement: HTMLVideoElement) => {
    videoElementRef.current = videoElement;
    if (heygenClientRef.current && avatarState.phase === 'ready') {
      heygenClientRef.current.startStreaming(videoElement);
    }
  };

  const cleanup = async () => {
    if (heygenClientRef.current) {
      await heygenClientRef.current.closeSession();
      heygenClientRef.current = null;
    }
    
    setAvatarState({
      phase: 'initializing',
      isConnected: false,
      sessionId: null,
      streamUrl: null,
      previewUrl: null,
      error: null,
      progress: 0,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Consulta con Dr. Carlos Mendoza</DialogTitle>
          <DialogDescription>
            Sesión de consulta psicológica virtual con avatar interactivo
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Consulta con Dr. Carlos Mendoza</h2>
                <p className="text-sm text-gray-600">Psicólogo Clínico Especializado</p>
              </div>

            </div>
          </div>

          {/* Video Area */}
          <div className="flex-1 p-4">
            {avatarState.phase === 'preview' || avatarState.phase === 'initializing' ? (
              <AvatarPreview avatarId="dr-carlos" className="h-full" />
            ) : (
              <AvatarVideoPlayer 
                avatarState={avatarState}
                onVideoReady={handleVideoReady}
              />
            )}
          </div>

          {/* Controls */}
          <div className="p-4 border-t">
            <AvatarControls
              avatarState={avatarState}
              onEndCall={handleEndCall}
              onMuteToggle={handleMuteToggle}
              isMuted={isMuted}
              isRecording={isRecording}
            />
          </div>

          {/* Status Messages */}
          {isProcessing && (
            <div className="px-4 pb-4">
              <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-lg text-center">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Procesando tu mensaje...
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}