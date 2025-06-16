
import { useMutation } from '@tanstack/react-query';
import { AudioUtils } from '@/lib/audio-utils';
import { TranscriptionResult, LLMResponse } from '@/types/voice';

interface UseAudioProcessorOptions {
  sessionId: string;
  language?: string;
  onUserMessage?: (message: string) => void;
  onAIResponse?: (response: string) => void;
}

export function useAudioProcessor(options: UseAudioProcessorOptions) {
  const { sessionId, language = 'es', onUserMessage, onAIResponse } = options;

  // Transcription mutation
  const transcribeMutation = useMutation({
    mutationFn: async (audioBlob: Blob): Promise<TranscriptionResult> => {
      const formData = new FormData();
      const wavBlob = await AudioUtils.convertToWav(audioBlob);
      formData.append('audio', wavBlob, 'recording.wav');
      formData.append('language', language);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Transcription failed');
      }

      return response.json();
    },
  });

  // LLM processing mutation
  const processLLMMutation = useMutation({
    mutationFn: async ({ 
      inputText, 
      isVoice, 
      audioData,
      isAvatarCall = false,
      avatarSessionId = null 
    }: { 
      inputText: string; 
      isVoice: boolean; 
      audioData?: string;
      isAvatarCall?: boolean;
      avatarSessionId?: string | null;
    }): Promise<LLMResponse> => {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputText,
          sessionId,
          isVoice,
          audioData,
          isAvatarCall,
          avatarSessionId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'LLM processing failed');
      }

      return response.json();
    },
  });

  const processAudioMessage = async (
    audioBlob: Blob, 
    isAvatarCall = false, 
    avatarSessionId: string | null = null
  ) => {
    // Transcribe audio
    const transcriptionResult = await transcribeMutation.mutateAsync(audioBlob);

    if (!transcriptionResult.transcription?.trim()) {
      throw new Error('No speech detected');
    }

    const userMessage = transcriptionResult.transcription;
    onUserMessage?.(userMessage);

    // Convert audio to base64 for storage
    const audioData = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(audioBlob);
    });

    // Process with LLM
    const llmResponse = await processLLMMutation.mutateAsync({
      inputText: userMessage,
      isVoice: true,
      audioData,
      isAvatarCall,
      avatarSessionId,
    });

    const aiResponse = llmResponse.replyText;
    onAIResponse?.(aiResponse);

    return { userMessage, aiResponse, transcriptionResult, llmResponse };
  };

  const processTextMessage = async (
    text: string, 
    isAvatarCall = false, 
    avatarSessionId: string | null = null
  ) => {
    const userMessage = text;
    onUserMessage?.(userMessage);

    // Process with LLM
    const llmResponse = await processLLMMutation.mutateAsync({
      inputText: userMessage,
      isVoice: false,
      isAvatarCall,
      avatarSessionId,
    });

    const aiResponse = llmResponse.replyText;
    onAIResponse?.(aiResponse);

    return { userMessage, aiResponse, llmResponse };
  };

  return {
    processAudioMessage,
    processTextMessage,
    transcribeMutation,
    processLLMMutation,
    isTranscribing: transcribeMutation.isPending,
    isProcessingLLM: processLLMMutation.isPending,
    isProcessing: transcribeMutation.isPending || processLLMMutation.isPending,
  };
}
