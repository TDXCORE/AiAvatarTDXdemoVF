
import { useState, useCallback } from 'react';
import { ChatMessage } from '@/types/voice';

interface TranscriptMessage extends ChatMessage {
  speaker: 'user' | 'doctor';
  isTyping?: boolean;
  confidence?: number;
  processingTime?: number;
}

interface TranscriptState {
  messages: TranscriptMessage[];
  isVisible: boolean;
  autoScroll: boolean;
  typingIndicator: {
    isActive: boolean;
    speaker: 'user' | 'doctor';
    text: string;
  };
}

export function useTranscriptionState() {
  const [state, setState] = useState<TranscriptState>({
    messages: [],
    isVisible: false,
    autoScroll: true,
    typingIndicator: {
      isActive: false,
      speaker: 'user',
      text: ''
    }
  });

  const addMessage = useCallback((message: Partial<TranscriptMessage> & { content: string; speaker: 'user' | 'doctor' }) => {
    const newMessage: TranscriptMessage = {
      id: `transcript_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: message.speaker === 'user' ? 'user' : 'assistant',
      content: message.content,
      timestamp: new Date(),
      speaker: message.speaker,
      isVoice: message.isVoice || false,
      confidence: message.confidence,
      processingTime: message.processingTime,
      ...message
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage]
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: []
    }));
  }, []);

  const toggle = useCallback(() => {
    setState(prev => ({
      ...prev,
      isVisible: !prev.isVisible
    }));
  }, []);

  const show = useCallback(() => {
    setState(prev => ({
      ...prev,
      isVisible: true
    }));
  }, []);

  const hide = useCallback(() => {
    setState(prev => ({
      ...prev,
      isVisible: false
    }));
  }, []);

  const setAutoScroll = useCallback((autoScroll: boolean) => {
    setState(prev => ({
      ...prev,
      autoScroll
    }));
  }, []);

  const startTyping = useCallback((speaker: 'user' | 'doctor', text: string = '') => {
    setState(prev => ({
      ...prev,
      typingIndicator: {
        isActive: true,
        speaker,
        text
      }
    }));
  }, []);

  const stopTyping = useCallback(() => {
    setState(prev => ({
      ...prev,
      typingIndicator: {
        isActive: false,
        speaker: 'user',
        text: ''
      }
    }));
  }, []);

  return {
    // Estado
    messages: state.messages,
    isVisible: state.isVisible,
    autoScroll: state.autoScroll,
    typingIndicator: state.typingIndicator,
    
    // Acciones
    addMessage,
    clearMessages,
    toggle,
    show,
    hide,
    setAutoScroll,
    startTyping,
    stopTyping,
    
    // Helpers
    messageCount: state.messages.length,
    voiceMessageCount: state.messages.filter(m => m.isVoice).length,
    lastMessage: state.messages[state.messages.length - 1] || null
  };
}
