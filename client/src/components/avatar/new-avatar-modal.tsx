import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StreamingAvatarClient, StreamingAvatarState } from "@/lib/streaming-avatar-client";
import { useUnifiedVAD } from "@/hooks/use-unified-vad";
import { useAudioProcessor } from "@/hooks/use-audio-processor";
import { useToast } from "@/hooks/use-toast";
import { useTranscriptionState } from "@/hooks/use-transcription-state";
import { useCallState } from "@/contexts/call-context";
import { ChatMessage } from "@/types/voice";
import { MessageBubble } from "../message-bubble";
import { ConversationTranscript } from "./conversation-transcript";
import { X, Send, ArrowLeft, MessageSquare, ScrollText } from "lucide-react";

interface NewAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onMessageReceived?: (userMessage: string, aiResponse: string) => void;
}

export function NewAvatarModal({ 
  isOpen, 
  onClose, 
  sessionId, 
  onMessageReceived 
}: NewAvatarModalProps) {
  const { toast } = useToast();
  const { state: callState, dispatch: callDispatch } = useCallState();

  const [avatarState, setAvatarState] = useState<StreamingAvatarState>({
    phase: 'initializing',
    isConnected: false,
    sessionToken: null,
    error: null,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [timeRemaining, setTimeRemaining] = useState('09:53');

  const avatarClientRef = useRef<StreamingAvatarClient | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hook de transcripción
  const transcription = useTranscriptionState();

  // Audio processor hook with enhanced conversation management
  const audioProcessor = useAudioProcessor({
    sessionId,
    language: 'es',
    onUserMessage: (message) => {
      console.log('🗨️ User message processed:', message);

      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
        isVoice: true,
      };
      setMessages(prev => [...prev, userMessage]);

      // Agregar a transcripción
      transcription.addMessage({
        content: message,
        speaker: 'user',
        isVoice: true,
        timestamp: new Date(),
      });

      onMessageReceived?.(message, '');
    },
    onAIResponse: async (response) => {
      console.log('🤖 AI response received:', response);

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Agregar a transcripción
      transcription.addMessage({
        content: response,
        speaker: 'doctor',
        isVoice: false,
        timestamp: new Date(),
      });

      // Send response to avatar
      if (avatarClientRef.current?.isReady()) {
        try {
          setAvatarState(prev => ({ ...prev, phase: 'speaking' }));
          await avatarClientRef.current.speakAgentResponse(response);

          console.log('✅ Response sent to avatar, VAD will reactivate when speaking ends');

        } catch (error) {
          console.error('Failed to send response to avatar:', error);
        }
      }

      onMessageReceived?.('', response);
    },
  });

  // Unified VAD system
  const { vad, recorder, isVADActive } = useUnifiedVAD(async (audioBlob: Blob) => {
    if (!avatarClientRef.current?.isReady()) {
      console.warn('No active avatar session for audio processing');
      return;
    }

    try {
      await audioProcessor.processAudioMessage(
        audioBlob, 
        true,
        avatarClientRef.current.getSessionToken()
      );
    } catch (error) {
      console.error('Error processing audio message:', error);
      toast({
        title: 'Processing Error',
        description: error instanceof Error ? error.message : 'Failed to process audio',
        variant: 'destructive',
      });
    }
  });

  useEffect(() => {
    if (isOpen && !avatarClientRef.current) {
      // Solo inicializar si no hay cliente activo
      const initTimer = setTimeout(() => {
        initializeAvatarSession();
      }, 500);
      return () => clearTimeout(initTimer);
    }
    // ELIMINAR: else cleanup() - Esto causa el problema
  }, [isOpen]);

  useEffect(() => {
    return () => {
      // Solo cleanup cuando el componente se desmonta definitivamente
      if (!isOpen) {
        cleanup();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Timer effect
  useEffect(() => {
    if (callState.isCallActive) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          const [minutes, seconds] = prev.split(':').map(Number);
          const totalSeconds = minutes * 60 + seconds;
          if (totalSeconds <= 0) return '00:00';

          const newTotal = totalSeconds - 1;
          const newMinutes = Math.floor(newTotal / 60);
          const newSeconds = newTotal % 60;
          return `${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}`;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [callState.isCallActive]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const initializeAvatarSession = async () => {
    try {
      console.log('🎬 Iniciando sesión de avatar...');
      setAvatarState(prev => ({ ...prev, phase: 'initializing', error: null }));

      if (!videoRef.current) {
        throw new Error('Video element not available');
      }

      // Cleanup any existing client
      if (avatarClientRef.current) {
        await avatarClientRef.current.close();
        avatarClientRef.current = null;
      }

      // Initialize StreamingAvatar client with call context integration
      avatarClientRef.current = new StreamingAvatarClient((newState) => {
        setAvatarState(prev => {
          const updatedState = { ...prev, ...newState };

          // Log state changes for debugging
          console.log('🎭 Avatar state changed:', {
            phase: newState.phase,
            isConnected: newState.isConnected,
            prevPhase: prev.phase
          });

          return updatedState;
        });
      }, callDispatch);

      // Initialize with video element
      await avatarClientRef.current.initialize(videoRef.current);

      // Start call automatically
      handleStartCall();

    } catch (error) {
      console.error('❌ Failed to initialize avatar session:', error);
      setAvatarState(prev => ({ 
        ...prev, 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Connection failed',
        isConnected: false
      }));
    }
  };

  const handleSendText = async (text: string) => {
    if (!text.trim() || !avatarClientRef.current?.isReady()) return;

    try {
      setTextInput('');

      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
        isVoice: false,
      };
      setMessages(prev => [...prev, userMessage]);

      // Agregar a transcripción
      transcription.addMessage({
        content: text,
        speaker: 'user',
        isVoice: false,
        timestamp: new Date(),
      });

      await audioProcessor.processTextMessage(
        text, 
        true,
        avatarClientRef.current.getSessionToken()
      );

    } catch (error) {
      console.error('Error processing text message:', error);
      toast({
        title: 'Processing Error',
        description: error instanceof Error ? error.message : 'Failed to process message',
        variant: 'destructive',
      });
    }
  };

  const handleStartCall = async () => {
    if (!avatarClientRef.current) return;

    try {
      // Update call context
      callDispatch({ type: 'SET_CALL_ACTIVE', active: true });
      callDispatch({ type: 'SET_PHASE', phase: 'speaking' });

      setAvatarState(prev => ({ ...prev, phase: 'speaking', isConnected: true }));

      // Request microphone permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100
          }
        });
        stream.getTracks().forEach(track => track.stop());
        console.log('🎤 Microphone permissions granted for call');
      } catch (error) {
        console.error('🎤 Microphone not available:', error);
        toast({
          title: 'Micrófono no disponible',
          description: 'Puedes usar el chat de texto para comunicarte.',
          variant: 'destructive',
        });
      }

      // Send initial greeting - VAD will auto-activate when avatar stops speaking
      console.log('🎤 Sending initial greeting...');
      await avatarClientRef.current.speakAgentResponse("¡Hola! Soy el Dr. Carlos Mendoza. ¿En qué puedo ayudarte hoy?");

    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };

  const cleanup = async () => {
    console.log('🧹 Cleaning up avatar session...');

    // Reset call state first
    callDispatch({ type: 'RESET' });

    if (avatarClientRef.current) {
      try {
        await avatarClientRef.current.close();
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
      avatarClientRef.current = null;
    }

    // Reset all states
    setAvatarState({
      phase: 'initializing',
      isConnected: false,
      sessionToken: null,
      error: null,
    });

    console.log('✅ Cleanup completed');
  };

  const ready = Boolean(avatarState.sessionToken) && avatarState.phase !== 'error' && avatarState.phase !== 'initializing';

  return (
    <Dialog open={isOpen} onOpenChange={() => {}} modal={true}>
      <DialogContent className="max-w-full max-h-full h-screen w-screen p-0 m-0 flex flex-col bg-black">
        <DialogTitle className="sr-only">TDX DEMO DOCTOR</DialogTitle>
        <DialogDescription className="sr-only">TDX DEMO DOCTOR</DialogDescription>

        {/* Header */}
        <div className="bg-black text-white p-4 flex items-center justify-between relative z-10">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-medium">TDX DEMO DOCTOR</h1>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={transcription.toggle}
              className={`text-white hover:bg-white/10 ${transcription.isVisible ? 'bg-blue-600/30' : ''}`}
              title="Mostrar transcripción"
            >
              <ScrollText className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-red-500 bg-red-600/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Timer */}
        <div className="bg-black/50 backdrop-blur-sm px-4 py-2 flex justify-center relative z-10">
          <div className="bg-gray-600 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <span>Time remaining {timeRemaining}</span>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 h-6 w-6 text-white hover:bg-white/10"
              onClick={onClose}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Avatar Video Display */}
        <div className="flex-1 relative bg-black">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted={false}
            controls={false}
            style={{ display: avatarState.isConnected && ready ? 'block' : 'none' }}
          />

          {/* Fallback display */}
          {(!avatarState.isConnected || !ready) && (
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="w-32 h-32 mx-auto mb-4 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-5xl">👩‍💼</span>
                </div>
                <h3 className="text-2xl font-medium mb-2">DOCTOR</h3>
                <p className="text-lg opacity-80 mb-4">TDX DEMO DOCTOR</p>
                {avatarState.phase === 'initializing' && (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mr-3"></div>
                    <span>Connecting...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status overlays */}
          {callState.phase === 'speaking' && (
            <div className="absolute bottom-20 left-4 bg-blue-500 text-white px-4 py-2 rounded-full text-sm flex items-center">
              <div className="w-3 h-3 bg-white rounded-full animate-bounce mr-2"></div>
              Doctor is speaking...
            </div>
          )}

          {callState.phase === 'listening' && (
            <div className="absolute bottom-20 left-4 bg-green-500 text-white px-4 py-2 rounded-full text-sm flex items-center">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse mr-2"></div>
              Listening automatically...
            </div>
          )}

          {/* Recording indicator */}
          {recorder.isRecording && (
            <div className="absolute top-20 right-4 bg-red-500 text-white px-4 py-2 rounded-full text-sm flex items-center">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse mr-2"></div>
              Recording... {recorder.recordingDuration}s
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="bg-black p-4 relative z-10">
          {/* Text Input */}
          <div className="flex space-x-2">
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={audioProcessor.isProcessing ? "Procesando..." : "Escribe tu mensaje aquí..."}
              className={`flex-1 ${audioProcessor.isProcessing ? 'bg-gray-100' : 'bg-white'} text-black rounded-full px-4 py-3 border-2 ${textInput.trim() ? 'border-blue-500' : 'border-gray-300'} focus:border-blue-600`}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText(textInput);
                }
              }}
              disabled={!ready || audioProcessor.isProcessing}
            />
            <Button
              onClick={() => handleSendText(textInput)}
              disabled={!textInput.trim() || !ready || audioProcessor.isProcessing}
              size="icon"
              className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>

          {/* Status */}
          <div className="text-center mt-3 text-sm">
            {audioProcessor.isProcessing && (
              <div className="flex items-center justify-center space-x-2 text-blue-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span>Procesando mensaje...</span>
              </div>
            )}
            {!audioProcessor.isProcessing && (
              <div className="text-white/70">
                {avatarState.phase === 'initializing' && "Conectando con el Dr. Mendoza..."}
                {avatarState.phase === 'ready' && !callState.isCallActive && "Listo para comenzar la conversación"}
                {avatarState.phase === 'ready' && callState.isCallActive && "Conversación activa - Habla naturalmente o usa el chat"}
                {callState.phase === 'listening' && !recorder.isRecording && isVADActive && (
                  <span className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span>Escuchando automáticamente - Solo habla</span>
                  </span>
                )}
                {callState.phase === 'listening' && !recorder.isRecording && !isVADActive && "Activando detección de voz..."}
                {callState.phase === 'listening' && recorder.isRecording && (
                  <span className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                    <span>Grabando... {recorder.recordingDuration}s</span>
                  </span>
                )}
                {callState.phase === 'speaking' && (
                  <span className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <span>El Dr. Mendoza está respondiendo...</span>
                  </span>
                )}
                {avatarState.phase === 'error' && "Error de conexión - Intenta nuevamente"}
              </div>
            )}
          </div>
        </div>

        {/* Componente de Transcripción */}
        <ConversationTranscript
          messages={transcription.messages}
          isVisible={transcription.isVisible}
          onToggle={transcription.toggle}
          className="fixed right-0 top-0 h-full z-50"
        />
      </DialogContent>
    </Dialog>
  );
}