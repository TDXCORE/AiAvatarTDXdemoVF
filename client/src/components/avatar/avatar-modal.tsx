
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StreamingAvatarClient, StreamingAvatarState } from "@/lib/streaming-avatar-client";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import { useAudioProcessor } from "@/hooks/use-audio-processor";
import { useToast } from "@/hooks/use-toast";
import { ChatMessage } from "@/types/voice";
import { MessageBubble } from "../message-bubble";
import { Mic, MicOff, X, Send, Settings, Phone, PhoneOff } from "lucide-react";

interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onMessageReceived?: (userMessage: string, aiResponse: string) => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

export function AvatarModal({ 
  isOpen, 
  onClose, 
  sessionId, 
  onMessageReceived,
  videoRef: externalVideoRef 
}: AvatarModalProps) {
  const { toast } = useToast();
  const [avatarState, setAvatarState] = useState<StreamingAvatarState>({
    phase: 'initializing',
    isConnected: false,
    sessionToken: null,
    error: null,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  const avatarClientRef = useRef<StreamingAvatarClient | null>(null);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use external video ref if provided, otherwise use internal
  const videoRef = externalVideoRef || internalVideoRef;

  // Voice Activity Detection
  const vad = useVoiceActivity({
    sensitivity: 70,
    onSpeechStart: () => {
      console.log('Avatar: Speech started');
      if (!recorder.isRecording && isCallActive && !isMuted) {
        handleStartRecording();
      }
    },
    onSpeechEnd: () => {
      console.log('Avatar: Speech ended');
      if (recorder.isRecording && isCallActive) {
        handleStopRecording();
      }
    },
  });

  // Audio Recorder
  const recorder = useAudioRecorder({
    onRecordingStart: () => {
      vad.startListening();
    },
    onRecordingStop: async (result) => {
      vad.stopListening();
      if (result.audioBlob) {
        await processAudioMessage(result.audioBlob);
      }
    },
    onError: (errorMessage) => {
      toast({
        title: 'Recording Error',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Audio processor hook
  const audioProcessor = useAudioProcessor({
    sessionId,
    language: 'es',
    onUserMessage: (message) => {
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
        isVoice: true,
      };
      setMessages(prev => [...prev, userMessage]);
      onMessageReceived?.(message, ''); // Send immediately, AI response will come later
    },
    onAIResponse: async (response) => {
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      // Send response to avatar
      if (avatarClientRef.current?.isReady()) {
        try {
          await avatarClientRef.current.speakAgentResponse(response);
        } catch (error) {
          console.error('Failed to send response to avatar:', error);
        }
      }
      
      // Also notify parent component
      onMessageReceived?.('', response);
    },
  });

  useEffect(() => {
    if (isOpen) {
      // Check microphone permissions first
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          console.log('🎤 Microphone permissions granted');
          const timer = setTimeout(() => {
            initializeAvatarSession();
          }, 100);
          return () => clearTimeout(timer);
        })
        .catch((error) => {
          console.error('🎤 Microphone permission denied:', error);
          toast({
            title: 'Permisos de Micrófono',
            description: 'Necesitas permitir el acceso al micrófono para usar la función de voz.',
            variant: 'destructive',
          });
          // Still initialize avatar for text-only mode
          initializeAvatarSession();
        });
    } else {
      cleanup();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const initializeAvatarSession = async () => {
    try {
      console.log('🎬 Iniciando sesión de avatar...');
      setAvatarState(prev => ({ ...prev, phase: 'initializing', error: null }));

      if (!videoRef.current) {
        console.error('❌ Video element not available');
        throw new Error('Video element not available');
      }

      console.log('📹 Video element found:', videoRef.current);

      // Cleanup any existing client
      if (avatarClientRef.current) {
        await avatarClientRef.current.close();
        avatarClientRef.current = null;
      }

      // Initialize StreamingAvatar client
      avatarClientRef.current = new StreamingAvatarClient((newState) => {
        console.log('🔄 Avatar state update:', newState);
        setAvatarState(prev => ({ ...prev, ...newState }));
      });

      // Initialize with video element
      await avatarClientRef.current.initialize(videoRef.current);
      console.log('✅ Avatar client initialized successfully');

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

  const processAudioMessage = async (audioBlob: Blob) => {
    if (!avatarClientRef.current?.isReady()) {
      console.warn('No active avatar session for audio processing');
      return;
    }

    try {
      setAvatarState(prev => ({ ...prev, phase: 'listening' }));
      
      await audioProcessor.processAudioMessage(
        audioBlob, 
        true, // isAvatarCall
        avatarClientRef.current.getSessionToken()
      );

    } catch (error) {
      console.error('Error processing audio message:', error);
      toast({
        title: 'Processing Error',
        description: error instanceof Error ? error.message : 'Failed to process audio',
        variant: 'destructive',
      });
      setAvatarState(prev => ({ 
        ...prev, 
        phase: 'error', 
        error: error instanceof Error ? error.message : 'Processing failed' 
      }));
    }
  };

  const handleSendText = async (text: string) => {
    if (!text.trim() || !avatarClientRef.current?.isReady()) return;

    try {
      setTextInput('');
      
      await audioProcessor.processTextMessage(
        text, 
        true, // isAvatarCall
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
      setIsCallActive(true);
      setAvatarState(prev => ({ ...prev, phase: 'listening', isConnected: true }));
      
      // Send initial greeting
      await avatarClientRef.current.speakAgentResponse("¡Hola! Soy el Dr. Carlos Mendoza. ¿En qué puedo ayudarte hoy?");
      
      // Start VAD listening automatically
      setTimeout(() => {
        if (!isMuted) {
          vad.startListening();
          console.log('🎤 VAD started for avatar conversation');
        }
      }, 2000); // Wait 2 seconds after greeting
    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };

  const handleEndCall = async () => {
    if (!avatarClientRef.current) return;
    
    try {
      setIsCallActive(false);
      vad.stopListening();
      recorder.cancelRecording();
      await avatarClientRef.current.close();
      onClose();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      vad.stopListening();
      recorder.cancelRecording();
    } else if (isCallActive) {
      vad.startListening();
    }
  };

  const handleStartRecording = () => {
    if (!isMuted && isCallActive && avatarState.phase === 'ready') {
      recorder.startRecording();
    }
  };

  const handleStopRecording = () => {
    if (recorder.isRecording) {
      recorder.stopRecording();
    }
  };

  const cleanup = async () => {
    vad.stopListening();
    recorder.cancelRecording();
    
    if (avatarClientRef.current) {
      try {
        await avatarClientRef.current.close();
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
      avatarClientRef.current = null;
    }
  };

  const ready = Boolean(avatarState.sessionToken) && avatarState.phase !== 'error' && avatarState.phase !== 'initializing';
  const canStartCall = ready && !isCallActive;
  const isProcessing = audioProcessor.isProcessing;

  const renderAvatarDisplay = () => {
    return (
      <div className="w-full h-full relative bg-gray-900 rounded-lg overflow-hidden">
        {/* Video element for StreamingAvatar */}
        {!externalVideoRef && (
          <video
            ref={internalVideoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted={false}
            controls={false}
            onLoadStart={() => console.log('📹 Video loading started')}
            onLoadedData={() => console.log('📹 Video data loaded')}
            onPlay={() => console.log('📹 Video playing')}
            onError={(e) => console.error('📹 Video error:', e)}
            onCanPlay={() => console.log('📹 Video can play')}
            onLoadedMetadata={() => console.log('📹 Video metadata loaded')}
          />
        )}
        
        {/* Show external video if provided */}
        {externalVideoRef?.current && (
          <div className="absolute inset-0">
            {/* External video is already rendered elsewhere */}
          </div>
        )}
        
        {/* Fallback when no video stream or connection issues */}
        {(!avatarState.isConnected || avatarState.phase === 'initializing' || avatarState.phase === 'connecting' || avatarState.phase === 'error') && (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-24 h-24 mx-auto mb-4 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-3xl">👨‍⚕️</span>
              </div>
              <h3 className="text-xl font-medium mb-2">Dr. Carlos Mendoza</h3>
              <p className="text-sm opacity-80 mb-4">Psicólogo Clínico Especializado</p>
              {avatarState.phase === 'initializing' && (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-2"></div>
                  <span className="text-sm">Inicializando...</span>
                </div>
              )}
              {avatarState.phase === 'connecting' && (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-2"></div>
                  <span className="text-sm">Conectando...</span>
                </div>
              )}
              {avatarState.phase === 'error' && (
                <div className="text-center">
                  <div className="text-4xl mb-2">⚠️</div>
                  <p className="text-sm mb-2">Modo de respaldo activo</p>
                  <p className="text-xs opacity-80">El avatar funciona solo por audio</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* State overlays */}
        {avatarState.isConnected && avatarState.phase === 'speaking' && (
          <div className="absolute bottom-4 left-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce mr-2"></div>
            Dr. Carlos está hablando...
          </div>
        )}
        
        {avatarState.isConnected && avatarState.phase === 'listening' && (
          <div className="absolute bottom-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></div>
            Escuchando...
          </div>
        )}

        {avatarState.isConnected && avatarState.phase === 'ready' && (
          <div className="absolute bottom-4 left-4 bg-emerald-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full mr-2"></div>
            Listo para conversar
          </div>
        )}

        {/* VAD Status */}
        {vad.vadDetected && isCallActive && (
          <div className="absolute top-4 left-4 bg-yellow-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></div>
            Detectando voz...
          </div>
        )}

        {/* Recording indicator */}
        {recorder.isRecording && (
          <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></div>
            Grabando... {recorder.recordingDuration}s
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-0 flex flex-row items-center justify-between">
          <div>
            <DialogTitle>Dr. Carlos Mendoza - Consulta Virtual</DialogTitle>
            <DialogDescription>
              Conversa por voz o texto con tu asistente de IA especializado en psicología
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Avatar Display */}
          <div className="flex-1 p-6">
            {avatarState.phase === 'error' ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
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

          {/* Chat Panel */}
          <div className="w-96 border-l bg-gray-50 dark:bg-gray-900 flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b">
              <h3 className="font-medium">Conversación</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isCallActive ? 'Consulta activa' : 'Lista para iniciar'}
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 text-sm">
                  <div className="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-lg">👋</span>
                  </div>
                  Inicia la consulta para comenzar a conversar
                </div>
              )}

              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onPlayAudio={() => {}} // Audio playback handled by avatar
                />
              ))}

              {/* Processing indicator */}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-white max-w-xs px-4 py-3 rounded-r-2xl rounded-bl-lg shadow-sm border">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Text Input */}
            <div className="p-4 border-t">
              <div className="flex space-x-2">
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendText(textInput);
                    }
                  }}
                  disabled={!ready || isProcessing}
                />
                <Button
                  onClick={() => handleSendText(textInput)}
                  disabled={!textInput.trim() || !ready || isProcessing}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-6 pt-0 border-t">
          <div className="flex items-center justify-center space-x-4">
            {/* Start/End Call */}
            {canStartCall ? (
              <Button
                onClick={handleStartCall}
                disabled={!ready}
                className="bg-green-600 hover:bg-green-700"
              >
                <Phone className="h-4 w-4 mr-2" />
                Iniciar Consulta
              </Button>
            ) : (
              <Button
                onClick={handleEndCall}
                variant="destructive"
                disabled={!isCallActive}
              >
                <PhoneOff className="h-4 w-4 mr-2" />
                Finalizar Consulta
              </Button>
            )}
            
            {/* Voice Recording */}
            <Button
              variant={recorder.isRecording ? "destructive" : "outline"}
              size="icon"
              onMouseDown={handleStartRecording}
              onMouseUp={handleStopRecording}
              onMouseLeave={handleStopRecording}
              onTouchStart={handleStartRecording}
              onTouchEnd={handleStopRecording}
              disabled={isMuted || isProcessing || !isCallActive || !ready}
              title={!isCallActive ? "Inicia la consulta primero" : !ready ? "Esperando conexión..." : recorder.isRecording ? "Suelta para enviar" : "Mantén presionado para hablar"}
            >
              {recorder.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            {/* Mute */}
            <Button
              variant={isMuted ? "destructive" : "outline"}
              onClick={handleMuteToggle}
              disabled={!ready}
              size="icon"
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            {/* Settings */}
            <Button
              variant="outline"
              onClick={() => setShowSettings(true)}
              size="icon"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Status */}
          <div className="text-center mt-4 text-sm text-gray-600 dark:text-gray-400">
            {avatarState.phase === 'initializing' && "Conectando con Dr. Carlos..."}
            {avatarState.phase === 'ready' && !isCallActive && "Presiona 'Iniciar Consulta' para comenzar"}
            {avatarState.phase === 'ready' && isCallActive && "Mantén presionado el micrófono para hablar"}
            {avatarState.phase === 'listening' && "Escuchando... puedes hablar ahora"}
            {avatarState.phase === 'speaking' && "Dr. Carlos está respondiendo..."}
            {avatarState.phase === 'error' && "Error de conexión - Usando modo de respaldo"}
            {isProcessing && "Procesando mensaje..."}
            {vad.vadDetected && isCallActive && " • Voz detectada"}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
