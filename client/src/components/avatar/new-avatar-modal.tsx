import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StreamingAvatarClient, StreamingAvatarState } from "@/lib/streaming-avatar-client";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import { useAudioProcessor } from "@/hooks/use-audio-processor";
import { useToast } from "@/hooks/use-toast";
import { ChatMessage } from "@/types/voice";
import { MessageBubble } from "../message-bubble";
import { Mic, MicOff, X, Send, ArrowLeft, MessageSquare } from "lucide-react";

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
  const [timeRemaining, setTimeRemaining] = useState('09:53');

  const avatarClientRef = useRef<StreamingAvatarClient | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice Activity Detection
  const vad = useVoiceActivity({
    sensitivity: 70,
    onSpeechStart: () => {
      console.log('Speech started');
      if (!recorder.isRecording && isCallActive && !isMuted) {
        handleStartRecording();
      }
    },
    onSpeechEnd: () => {
      console.log('Speech ended');
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

  useEffect(() => {
    if (isOpen) {
      // Initialize avatar when modal opens
      const initTimer = setTimeout(() => {
        initializeAvatarSession();
      }, 500);
      
      return () => clearTimeout(initTimer);
    } else {
      cleanup();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => cleanup();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Timer effect
  useEffect(() => {
    if (isCallActive) {
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
  }, [isCallActive]);

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

      // Initialize StreamingAvatar client
      avatarClientRef.current = new StreamingAvatarClient((newState) => {
        setAvatarState(prev => ({ ...prev, ...newState }));
      });

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

        // Start VAD after a delay
        setTimeout(() => {
          if (!isMuted && isCallActive) {
            vad.startListening();
            console.log('🎤 VAD started listening');
          }
        }, 1000);
      } catch (error) {
        console.error('🎤 Microphone not available:', error);
        toast({
          title: 'Micrófono no disponible',
          description: 'Puedes usar el chat de texto para comunicarte.',
          variant: 'destructive',
        });
      }

      // Send initial greeting
      await avatarClientRef.current.speakAgentResponse("¡Hola! Soy el Dr. Carlos Mendoza. ¿En qué puedo ayudarte hoy?");

    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };

  const handleStartRecording = () => {
    if (!isMuted && isCallActive) {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-full max-h-full h-screen w-screen p-0 m-0 flex flex-col bg-black">
        <DialogTitle className="sr-only">Chat with Judy - L&D Compliance Training</DialogTitle>
        <DialogDescription className="sr-only">Interactive avatar session for learning and development compliance training with voice and text communication</DialogDescription>
        
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
              <h1 className="text-lg font-medium">Chat with Judy - L&D Compliance Training</h1>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
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
                <h3 className="text-2xl font-medium mb-2">Judy</h3>
                <p className="text-lg opacity-80 mb-4">L&D Compliance Training</p>
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
          {avatarState.phase === 'speaking' && (
            <div className="absolute bottom-20 left-4 bg-blue-500 text-white px-4 py-2 rounded-full text-sm flex items-center">
              <div className="w-3 h-3 bg-white rounded-full animate-bounce mr-2"></div>
              Judy is speaking...
            </div>
          )}

          {avatarState.phase === 'listening' && (
            <div className="absolute bottom-20 left-4 bg-green-500 text-white px-4 py-2 rounded-full text-sm flex items-center">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse mr-2"></div>
              Listening...
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
          <div className="flex items-center justify-center space-x-4 mb-4">
            {/* Voice Recording Button */}
            <Button
              variant={recorder.isRecording ? "destructive" : "outline"}
              size="icon"
              className="w-12 h-12 rounded-full bg-white text-black hover:bg-gray-100"
              onMouseDown={handleStartRecording}
              onMouseUp={handleStopRecording}
              onMouseLeave={handleStopRecording}
              onTouchStart={handleStartRecording}
              onTouchEnd={handleStopRecording}
              disabled={isMuted || audioProcessor.isProcessing || !isCallActive || !ready}
            >
              {recorder.isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>

            {/* Chat Button */}
            <Button
              variant="outline"
              size="icon"
              className="w-12 h-12 rounded-full bg-white text-black hover:bg-gray-100"
            >
              <MessageSquare className="h-5 w-5" />
            </Button>
          </div>

          {/* Text Input */}
          <div className="flex space-x-2">
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-white text-black rounded-full px-4 py-3 border-0"
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
          <div className="text-center mt-3 text-sm text-white/70">
            {avatarState.phase === 'initializing' && "Connecting to Judy..."}
            {avatarState.phase === 'ready' && !isCallActive && "Ready to start conversation"}
            {avatarState.phase === 'ready' && isCallActive && "Press and hold microphone to speak"}
            {avatarState.phase === 'listening' && "You can speak now"}
            {avatarState.phase === 'speaking' && "Judy is responding..."}
            {avatarState.phase === 'error' && "Connection error - Please try again"}
            {audioProcessor.isProcessing && "Processing message..."}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}