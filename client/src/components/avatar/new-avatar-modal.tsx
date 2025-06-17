import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StreamingAvatarClient, StreamingAvatarState } from "@/lib/streaming-avatar-client";
import { useMicVAD } from "@/hooks/use-mic-vad";
import { useAudioProcessor } from "@/hooks/use-audio-processor";
import { useToast } from "@/hooks/use-toast";
import { ChatMessage } from "@/types/voice";
import { MessageBubble } from "../message-bubble";
import { Mic, MicOff, X, Send, Settings, Phone, PhoneOff } from "lucide-react";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      onMessageReceived?.(message, '');
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
      
      onMessageReceived?.('', response);
    },
  });

  // MicVAD integration
  const micVAD = useMicVAD({
    onSpeechStart: () => {
      console.log('🎤 New Avatar: Speech started');
    },
    onSpeechEnd: async (audioBlob: Blob) => {
      console.log('🎤 New Avatar: Speech ended, processing audio');
      await processAudioMessage(audioBlob);
    },
    onInterrupt: () => {
      console.log('🎤 New Avatar: User interrupt detected');
      if (avatarClientRef.current?.isReady() && avatarState.phase === 'speaking') {
        try {
          // Avatar interrupt functionality would go here
          console.log('Avatar interrupt requested');
        } catch (error) {
          console.error('Failed to interrupt avatar:', error);
        }
      }
    },
    autoStart: false
  });

  useEffect(() => {
    if (isOpen) {
      initializeAvatarSession();
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
      console.log('🎬 Iniciando nueva sesión de avatar...');
      setAvatarState(prev => ({ ...prev, phase: 'initializing', error: null }));

      if (!videoRef.current) {
        throw new Error('Video element not available');
      }

      if (avatarClientRef.current) {
        await avatarClientRef.current.close();
        avatarClientRef.current = null;
      }

      avatarClientRef.current = new StreamingAvatarClient((newState) => {
        console.log('🔄 New Avatar state update:', newState);
        setAvatarState(prev => ({ ...prev, ...newState }));
      });

      await avatarClientRef.current.initialize(videoRef.current);
      console.log('✅ New Avatar client initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize new avatar session:', error);
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
      setIsCallActive(true);
      setAvatarState(prev => ({ ...prev, phase: 'listening', isConnected: true }));
      
      if (micVAD.isReady && !isMuted) {
        console.log('🎤 Starting MicVAD for new avatar conversation');
        await micVAD.startListening();
      }
      
      await avatarClientRef.current.speakAgentResponse("¡Hola! Soy el Dr. Carlos Mendoza. ¿En qué puedo ayudarte hoy?");
      
    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };

  const handleEndCall = async () => {
    if (!avatarClientRef.current) return;
    
    try {
      setIsCallActive(false);
      
      if (micVAD.isListening) {
        await micVAD.pauseListening();
      }
      
      await avatarClientRef.current.close();
      onClose();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  };

  const handleMuteToggle = async () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      if (micVAD.isListening) {
        await micVAD.pauseListening();
      }
    } else if (isCallActive && micVAD.isReady) {
      await micVAD.startListening();
    }
  };

  const cleanup = async () => {
    if (micVAD.isListening) {
      await micVAD.pauseListening();
    }
    
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
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted={false}
          controls={false}
          style={{ display: avatarState.isConnected && avatarState.phase === 'ready' ? 'block' : 'none' }}
        />
        
        {(!avatarState.isConnected || avatarState.phase !== 'ready') && (
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
              {avatarState.phase === 'error' && (
                <div className="text-center">
                  <div className="text-4xl mb-2">⚠️</div>
                  <p className="text-sm mb-2">Error de conexión</p>
                  <p className="text-xs opacity-80">{avatarState.error}</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* MicVAD Status */}
        {micVAD.isListening && isCallActive && (
          <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></div>
            MicVAD Listening...
          </div>
        )}

        {micVAD.error && (
          <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm">
            VAD Error: {micVAD.error}
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

          <div className="w-96 border-l bg-gray-50 dark:bg-gray-900 flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-medium">Conversación</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isCallActive ? 'Consulta activa' : 'Lista para iniciar'}
              </p>
            </div>

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
                  onPlayAudio={() => {}}
                />
              ))}

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

        <div className="p-6 pt-0 border-t">
          <div className="flex items-center justify-center space-x-4">
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

            <Button
              variant={isMuted ? "destructive" : "outline"}
              onClick={handleMuteToggle}
              disabled={!ready}
              size="icon"
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowSettings(true)}
              size="icon"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="text-center mt-4 text-sm text-gray-600 dark:text-gray-400">
            {avatarState.phase === 'initializing' && "Conectando con Dr. Carlos..."}
            {avatarState.phase === 'ready' && !isCallActive && "Presiona 'Iniciar Consulta' para comenzar"}
            {avatarState.phase === 'ready' && isCallActive && "Habla naturalmente, MicVAD detectará tu voz"}
            {avatarState.phase === 'listening' && "Escuchando... puedes hablar ahora"}
            {avatarState.phase === 'speaking' && "Dr. Carlos está respondiendo..."}
            {avatarState.phase === 'error' && "Error de conexión"}
            {isProcessing && "Procesando mensaje..."}
            {micVAD.isListening && isCallActive && " • MicVAD activo"}
            {micVAD.error && ` • Error VAD: ${micVAD.error}`}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
