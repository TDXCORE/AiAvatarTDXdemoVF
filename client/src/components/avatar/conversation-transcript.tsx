
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FixedSizeList as List } from 'react-window';
import { ChatMessage } from '@/types/voice';
import { X, MessageSquare, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TranscriptMessage extends ChatMessage {
  speaker: 'user' | 'doctor';
  isTyping?: boolean;
  confidence?: number;
  processingTime?: number;
}

interface ConversationTranscriptProps {
  messages: TranscriptMessage[];
  isVisible: boolean;
  onToggle: () => void;
  className?: string;
}

export function ConversationTranscript({
  messages,
  isVisible,
  onToggle,
  className = ""
}: ConversationTranscriptProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [currentTyping, setCurrentTyping] = useState<string>('');
  const listRef = useRef<List>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final cuando hay nuevos mensajes
  useEffect(() => {
    if (autoScroll && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Componente de mensaje individual
  const MessageItem = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const message = messages[index];
    const isUser = message.speaker === 'user';
    const isRecent = index >= Math.max(0, messages.length - 3);

    return (
      <div style={style}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ 
            opacity: isRecent ? 1 : 0.7,
            y: 0 
          }}
          transition={{ duration: 0.3 }}
          className={`p-3 mx-2 mb-2 rounded-lg ${
            isUser 
              ? 'bg-blue-500/20 border-l-4 border-blue-500 ml-8' 
              : 'bg-gray-600/20 border-l-4 border-green-500 mr-8'
          }`}
        >
          <div className="flex items-center mb-1">
            <span className={`text-xs font-medium ${
              isUser ? 'text-blue-400' : 'text-green-400'
            }`}>
              {isUser ? 'Tú' : 'Dr. Carlos'}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              {message.timestamp.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
            {message.isVoice && (
              <span className="text-xs text-yellow-400 ml-1">🎤</span>
            )}
          </div>
          
          <p className={`text-sm leading-relaxed ${
            isRecent ? 'text-white' : 'text-gray-300'
          }`}>
            {message.isTyping ? (
              <TypingIndicator />
            ) : (
              message.content
            )}
          </p>
          
          {message.processingTime && (
            <div className="text-xs text-gray-500 mt-1">
              Procesado en {message.processingTime}ms
            </div>
          )}
        </motion.div>
      </div>
    );
  };

  // Indicador de escritura
  const TypingIndicator = () => (
    <div className="flex items-center space-x-1">
      <span className="text-gray-400">Escribiendo</span>
      <div className="typing-dots">
        <span className="inline-block w-1 h-1 bg-gray-400 rounded-full animate-pulse"></span>
        <span className="inline-block w-1 h-1 bg-gray-400 rounded-full animate-pulse"></span>
        <span className="inline-block w-1 h-1 bg-gray-400 rounded-full animate-pulse"></span>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={`fixed right-0 top-0 h-full w-80 bg-black/95 backdrop-blur-sm border-l border-gray-700 z-50 flex flex-col ${className}`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600/20 to-green-600/20 border-b border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ScrollText className="h-5 w-5 text-blue-400" />
                <h3 className="text-white font-medium">Transcripción</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Conversación en tiempo real
            </p>
          </div>

          {/* Messages Container */}
          <div className="flex-1 relative overflow-hidden">
            {/* Gradient overlay en la parte superior */}
            <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-black/95 to-transparent z-10 pointer-events-none" />
            
            {messages.length > 0 ? (
              <div className="h-full overflow-y-auto transcript-scroll">
                {messages.map((message, index) => (
                  <MessageItem 
                    key={message.id} 
                    index={index} 
                    style={{}} 
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">La conversación aparecerá aquí</p>
                </div>
              </div>
            )}

            {/* Gradient overlay en la parte inferior */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/95 to-transparent pointer-events-none" />
          </div>

          {/* Footer con estadísticas */}
          <div className="bg-gray-800/50 border-t border-gray-700 p-3">
            <div className="flex justify-between text-xs text-gray-400">
              <span>{messages.length} mensajes</span>
              <span>
                {messages.filter(m => m.isVoice).length} de voz
              </span>
            </div>
            <div className="flex items-center mt-2">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                messages.length > 0 ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
              }`} />
              <span className="text-xs text-gray-400">
                {messages.length > 0 ? 'Conversación activa' : 'Esperando mensajes...'}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
