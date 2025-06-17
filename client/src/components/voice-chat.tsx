import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageBubble } from './message-bubble';
import { VoiceControls } from './voice-controls';
import { VoiceRecorder } from './voice-recorder';
import { CallButton } from './avatar/call-button';
import { NewAvatarModal } from './avatar/new-avatar-modal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useAudioProcessor } from '@/hooks/use-audio-processor';
import { useMicVAD } from '@/hooks/use-mic-vad';
import { apiRequest } from '@/lib/queryClient';
import { ChatMessage, VoiceSettings } from '@/types/voice';
import { Phone, MoreVertical, AlertTriangle, Bot } from 'lucide-react';
import { StreamingAvatarClient } from "@/lib/streaming-avatar-client";

export function VoiceChat() {
  const { toast } = useToast();
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [settings, setSettings] = useState<VoiceSettings>({
    vadSensitivity: 70,
    language: 'es',
    autoSend: true,
  });

  // Initialize conversation
  const { data: conversation } = useQuery({
    queryKey: ['/api/conversations'],
    queryFn: async () => {
      const response = await apiRequest('POST', '/api/conversations', { sessionId });
      return response.json();
    },
  });

  // MicVAD system for voice chat
  const micVAD = useMicVAD({
    onSpeechEnd: async (audioBlob: Blob) => {
      try {
        await processAudioRecording(audioBlob);
      } catch (error) {
        console.error('Error processing audio from MicVAD:', error);
        toast({
          title: 'Processing Error',
          description: error instanceof Error ? error.message : 'Failed to process audio',
          variant: 'destructive',
        });
      }
    },
    autoStart: true
  });

  // Audio processor hook
  const audioProcessor = useAudioProcessor({
    sessionId,
    language: settings.language,
    onUserMessage: (message) => {
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
        isVoice: true,
      };
      setMessages(prev => [...prev, userMessage]);
    },
    onAIResponse: (response) => {
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
  });

  const processAudioRecording = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      setIsTyping(true);

      await audioProcessor.processAudioMessage(audioBlob);

    } catch (error) {
      console.error('Error processing audio:', error);
      
      if (error instanceof Error && error.message === 'No speech detected') {
        toast({
          title: 'No Speech Detected',
          description: 'Please try speaking more clearly.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Processing Error',
          description: error instanceof Error ? error.message : 'Failed to process audio',
          variant: 'destructive',
        });
      }
    } finally {
      setIsProcessing(false);
      setIsTyping(false);
    }
  };

  const handleSendText = async (text: string) => {
    try {
      setIsProcessing(true);
      setIsTyping(true);

      await audioProcessor.processTextMessage(text);

    } catch (error) {
      console.error('Error processing text:', error);
      toast({
        title: 'Processing Error',
        description: error instanceof Error ? error.message : 'Failed to process message',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setIsTyping(false);  
    }
  };

  const [avatarState, setAvatarState] = useState({});
  const videoRef = useRef<HTMLVideoElement>(null);

  const [avatarClient] = useState(() => new StreamingAvatarClient(
    (state) => setAvatarState(prev => ({ ...prev, ...state }))
  ));

  useEffect(() => {
    if (videoRef.current) {
      avatarClient.initialize(videoRef.current);
    }
  }, [avatarClient]);

  const handleAvatarMessage = async (userMessage: string, aiResponse: string) => {
    // Add user message from avatar conversation
    const userChatMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      isVoice: true,
    };

    // Add assistant message from avatar conversation
    const assistantChatMessage: ChatMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date(),
      isVoice: true,
      metadata: {
        processingTime: 0
      },
    };

    setMessages(prev => [...prev, userChatMessage, assistantChatMessage]);
  };

  const handleStartRecording = () => {
    // Manual recording is now handled by unified VAD
    console.log('Manual recording trigger - handled by unified VAD');
  };

  const handleStopRecording = () => {
    // Manual stop is now handled by unified VAD
    console.log('Manual stop trigger - handled by unified VAD');
  };

  const handleCancelRecording = () => {
    if (recorder.isRecording) {
      recorder.cancelRecording();
    }
    setShowRecorder(false);
  };

  const handlePlayAudio = (audioData: string) => {
    const audio = new Audio(audioData);
    audio.play().catch(console.error);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // VAD is now automatically managed by useUnifiedVAD based on call state

  return (
    <div className="h-screen flex flex-col bg-[hsl(60,4.8%,95.9%)]">
      {/* Header */}
      <header className="bg-[hsl(135,60%,50%)] text-white px-4 py-3 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Avatar className="w-10 h-10 border-2 border-white/20">
              <AvatarFallback className="bg-[hsl(135,60%,40%)] text-white">
                <Bot className="w-5 h-5" />
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
          </div>

          <div className="flex-1">
            <h1 className="font-semibold text-lg">AI Voice Assistant</h1>
            <p className="text-xs text-green-100 flex items-center space-x-1">
              <span className="inline-block w-2 h-2 bg-green-300 rounded-full"></span>
              <span>Online • Voice-enabled</span>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              className="p-2 hover:bg-white/10 rounded-full text-white"
              onClick={() => setIsAvatarModalOpen(true)}
            >
              <Phone className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-2 hover:bg-white/10 rounded-full text-white"
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* VAD Status Banner */}
      {isVADActive && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            <span>Voice Activity Detection Active</span>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-4 relative">
        {/* Welcome Message */}
        {messages.length === 0 && (
          <div className="flex justify-center mb-6">
            <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg text-sm max-w-xs text-center border border-yellow-200">
              <Bot className="w-4 h-4 inline mr-2" />
              AI Voice Assistant is ready. Press and hold the microphone to start talking.
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onPlayAudio={handlePlayAudio}
          />
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start mb-4">
            <div className="bg-white max-w-xs px-4 py-3 rounded-r-2xl rounded-bl-lg shadow-sm border border-gray-100">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Voice Controls */}
      <VoiceControls
        isRecording={recorder.isRecording}
        vadDetected={vad.isVoiceActive}
        recordingDuration={recorder.recordingDuration}
        isProcessing={isProcessing}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onSendText={handleSendText}
        onOpenSettings={() => setShowSettings(true)}
        settings={settings}
      />

      {/* Voice Recorder Overlay */}
      <VoiceRecorder
        isOpen={showRecorder}
        recordingDuration={recorder.recordingDuration}
        onCancel={handleCancelRecording}
        onStop={handleStopRecording}
      />

      {/* Error Dialog */}
      {error && (
        <Dialog open={!!error} onOpenChange={() => setError(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Audio Error</span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => setError(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  handleStartRecording();
                }}
                className="flex-1 bg-red-500 hover:bg-red-600"
              >
                Retry
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Voice Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* VAD Sensitivity */}
            <div>
              <Label className="text-sm font-medium">
                Voice Detection Sensitivity
              </Label>
              <div className="mt-2">
                <Slider
                  value={[settings.vadSensitivity]}
                  onValueChange={([value]) => 
                    setSettings(prev => ({ ...prev, vadSensitivity: value }))
                  }
                  min={0}
                  max={100}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>
            </div>

            {/* Language Selection */}
            <div>
              <Label className="text-sm font-medium">Speech Language</Label>
              <Select
                value={settings.language}
                onValueChange={(value) => 
                  setSettings(prev => ({ ...prev, language: value }))
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Auto-send Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Auto-send on silence</Label>
                <p className="text-xs text-gray-500">Automatically send when you stop talking</p>
              </div>
              <Switch
                checked={settings.autoSend}
                onCheckedChange={(checked) => 
                  setSettings(prev => ({ ...prev, autoSend: checked }))
                }
              />
            </div>
          </div>

          <div className="flex space-x-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setSettings({
                vadSensitivity: 70,
                language: 'en',
                autoSend: true,
              })}
              className="flex-1"
            >
              Reset
            </Button>
            <Button
              onClick={() => setShowSettings(false)}
              className="flex-1 bg-[hsl(135,60%,50%)] hover:bg-[hsl(135,60%,40%)]"
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Avatar Modal */}
      <NewAvatarModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        sessionId={conversation?.sessionId || ''}
        onMessageReceived={handleAvatarMessage}
      />
    </div>
  );
}