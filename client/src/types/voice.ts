export interface VoiceActivityResult {
  isActive: boolean;
  confidence: number;
  timestamp: number;
}

export interface AudioRecordingResult {
  audioBlob: Blob;
  duration: number;
  transcription?: string;
}

export interface TranscriptionResult {
  transcription: string;
  duration: number;
  processingTime: number;
}

export interface LLMResponse {
  replyText: string;
  processingTime: number;
  contextState: {
    messageCount: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
  audioData?: string;
  metadata?: {
    transcriptionDuration?: number;
    processingTime?: number;
    vadDetected?: boolean;
  };
}

export interface ConversationState {
  sessionId: string;
  messages: ChatMessage[];
  isRecording: boolean;
  isProcessing: boolean;
  vadActive: boolean;
  error?: string;
}

export interface VoiceSettings {
  vadSensitivity: number;
  language: string;
  autoSend: boolean;
}
