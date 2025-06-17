
import { useState, useEffect, useRef, useCallback } from 'react';
import { useCallState } from '@/contexts/call-context';
import { useAudioRecorder } from './use-audio-recorder';

// Configuración VAD calibrada según guía quirúrgica
const VAD_CONFIG = {
  fftSize: 1024,              
  smoothingTimeConstant: 0.12, 
  minDecibels: -60,           
  maxDecibels: -5,            
  sampleRate: 16000,          
  bufferSize: 2048,           
  
  // Thresholds calibrados según guía quirúrgica
  voiceThreshold: 7,          // Reducido de 12 → 7 (voces normales 5-9 RMS)
  silenceThreshold: 4,        // Reducido de 8 → 4 (2-3 puntos bajo voiceThreshold)
  
  // Tiempos optimizados según guía
  speechStartDelay: 80,       // Reducido de 120ms → 80ms (más ágil)
  speechEndDelay: 280,        // Reducido de 350ms → 280ms (acelera turnaround)
  cooldownDelay: 200,         // Reducido de 1000ms → 200ms (crítico: evita congelamiento)
  minimumSpeechDuration: 250, // Mantener para palabras cortas
  
  // Filtros de frecuencia según guía
  voiceFreqMin: 65,           
  voiceFreqMax: 4000,         
};

type VADState = 'idle' | 'detecting' | 'speaking' | 'ending' | 'cooldown';

interface VADBuffer {
  samples: number[];
  timestamps: number[];
  confidence: number[];
  maxSize: number;
}

export const useUnifiedVAD = (onAudioProcessed: (audioBlob: Blob) => Promise<void>) => {
  const { state } = useCallState();
  const vadSingletonRef = useRef<boolean>(false);
  const initializationLockRef = useRef<boolean>(false);

  // Estados VAD internos
  const [isListening, setIsListening] = useState(false);
  const [vadState, setVadState] = useState<VADState>('idle');
  const [confidence, setConfidence] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timeoutsRef = useRef<{ start?: NodeJS.Timeout; end?: NodeJS.Timeout }>({});
  
  // Buffer para análisis avanzado
  const bufferRef = useRef<VADBuffer>({
    samples: [],
    timestamps: [],
    confidence: [],
    maxSize: 50
  });

  // Estado interno para tracking
  const stateRef = useRef({
    speechStartTime: 0,
    lastVoiceTime: 0,
    isSpeaking: false,
    consecutiveVoiceFrames: 0,
    consecutiveSilenceFrames: 0,
  });

  // Análisis avanzado de frecuencias de voz
  const analyzeVoiceFrequencies = useCallback((dataArray: Uint8Array, sampleRate: number): number => {
    const fftSize = dataArray.length;
    const binSize = sampleRate / (2 * fftSize);
    
    let voiceEnergy = 0;
    let totalEnergy = 0;
    
    // Analizar solo frecuencias de voz humana (65Hz - 4000Hz)
    const minBin = Math.floor(VAD_CONFIG.voiceFreqMin / binSize);
    const maxBin = Math.floor(VAD_CONFIG.voiceFreqMax / binSize);
    
    for (let i = 0; i < fftSize; i++) {
      const magnitude = dataArray[i];
      totalEnergy += magnitude;
      
      if (i >= minBin && i <= maxBin) {
        voiceEnergy += magnitude;
      }
    }
    
    // Retornar ratio de energía de voz vs total
    return totalEnergy > 0 ? (voiceEnergy / totalEnergy) : 0;
  }, []);

  // Cálculo de RMS con filtros anti-ruido
  const calculateRMS = useCallback((dataArray: Uint8Array): number => {
    let sum = 0;
    let validSamples = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      const sample = dataArray[i];
      
      // Filtro básico anti-ruido
      if (sample > 10) { // Ignorar ruido muy bajo
        sum += sample * sample;
        validSamples++;
      }
    }
    
    return validSamples > 0 ? Math.sqrt(sum / validSamples) : 0;
  }, []);

  // Single recorder instance
  const recorder = useAudioRecorder({
    onRecordingStop: async (result) => {
      if (result.audioBlob) {
        await onAudioProcessed(result.audioBlob);
      }
    },
    onError: (error) => {
      console.error('Unified VAD recording error:', error);
    },
  });

  const shouldActivateRecording = () => {
    return (
      state.isCallActive &&
      !state.isMuted &&
      state.phase === 'listening' &&
      state.avatarConnected &&
      !recorder.isRecording
    );
  };

  // Análisis inteligente de actividad de voz
  const analyzeVoiceActivity = useCallback(() => {
    if (!analyserRef.current || !isListening) {
      return;
    }

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Cálculos de análisis
    const rms = calculateRMS(dataArray);
    const voiceRatio = analyzeVoiceFrequencies(dataArray, VAD_CONFIG.sampleRate);
    const currentTime = Date.now();
    
    // Confianza basada en múltiples factores
    const rmsConfidence = Math.min(rms / VAD_CONFIG.voiceThreshold, 1);
    const freqConfidence = voiceRatio;
    const overallConfidence = (rmsConfidence * 0.7 + freqConfidence * 0.3) * (75 / 100); // sensitivity 75
    
    setConfidence(overallConfidence);
    
    // Actualizar buffer
    const buffer = bufferRef.current;
    buffer.samples.push(rms);
    buffer.timestamps.push(currentTime);
    buffer.confidence.push(overallConfidence);
    
    if (buffer.samples.length > buffer.maxSize) {
      buffer.samples.shift();
      buffer.timestamps.shift();
      buffer.confidence.shift();
    }

    // Detección de voz calibrada según guía (voiceRatio 0.20 → 0.10)
    const isVoiceDetected = rms > VAD_CONFIG.voiceThreshold && voiceRatio > 0.10;
    const isSilence = rms < VAD_CONFIG.silenceThreshold;
    const isAmbientNoise = rms > VAD_CONFIG.silenceThreshold && rms < VAD_CONFIG.voiceThreshold;
    
    const internalState = stateRef.current;
    
    if (isVoiceDetected) {
      internalState.lastVoiceTime = currentTime;
      internalState.consecutiveVoiceFrames++;
      internalState.consecutiveSilenceFrames = 0;
      
      // Detectar primera sílaba inmediatamente
      if (!internalState.isSpeaking && internalState.consecutiveVoiceFrames >= 1) {
        if (timeoutsRef.current.start) {
          clearTimeout(timeoutsRef.current.start);
        }
        
        timeoutsRef.current.start = setTimeout(() => {
          if (!internalState.isSpeaking && internalState.consecutiveVoiceFrames >= 2) {
            console.log('🎤 Unified VAD: Speech detected - starting recording');
            internalState.isSpeaking = true;
            internalState.speechStartTime = currentTime;
            setVadState('speaking');
            
            if (shouldActivateRecording()) {
              recorder.startRecording();
            }
          }
        }, VAD_CONFIG.speechStartDelay);
      }
      
    } else if (isSilence || isAmbientNoise) {
      internalState.consecutiveSilenceFrames++;
      
      // Solo reducir frames de voz si hay silencio real
      if (isSilence) {
        internalState.consecutiveVoiceFrames = Math.max(0, internalState.consecutiveVoiceFrames - 1);
      }
      
      // Confirmar final de habla con más paciencia
      if (internalState.isSpeaking && internalState.consecutiveSilenceFrames >= 8) {
        const silenceDuration = currentTime - internalState.lastVoiceTime;
        const speechDuration = currentTime - internalState.speechStartTime;
        
        if (silenceDuration > VAD_CONFIG.speechEndDelay && speechDuration > VAD_CONFIG.minimumSpeechDuration) {
          if (timeoutsRef.current.end) {
            clearTimeout(timeoutsRef.current.end);
          }
          
          timeoutsRef.current.end = setTimeout(() => {
            if (internalState.isSpeaking) {
              console.log('🎤 Unified VAD: Speech ended - stopping recording');
              internalState.isSpeaking = false;
              setVadState('ending');
              
              if (recorder.isRecording) {
                recorder.stopRecording();
              }
              
              // Cooldown optimizado según guía (200ms en lugar de 1000ms)
              setTimeout(() => {
                if (isListening) {
                  setVadState('cooldown');
                  setTimeout(() => {
                    if (isListening) {
                      setVadState('detecting');
                      console.log('🎤 VAD ready for new detection after cooldown');
                    }
                  }, VAD_CONFIG.cooldownDelay);
                }
              }, 200);
            }
          }, 50);
        }
      }
    }

    // Continuar análisis si está escuchando y el contexto es válido
    if (isListening && analyserRef.current && audioContextRef.current?.state === 'running') {
      animationFrameRef.current = requestAnimationFrame(analyzeVoiceActivity);
    }
  }, [
    calculateRMS,
    analyzeVoiceFrequencies,
    isListening,
    shouldActivateRecording,
    recorder
  ]);

  const startListening = useCallback(async () => {
    if (isListening) return;

    try {
      console.log('🎤 Starting voice activity detection...');
      
      // Verificar que no hay streams previos activos
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Configuración de audio optimizada para voz
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: VAD_CONFIG.sampleRate,
          channelCount: 1,
        }
      });

      console.log('🎤 Audio stream obtained');
      
      // Verificar que el stream es válido y tiene tracks activos
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
        throw new Error('Invalid audio stream - no active audio tracks');
      }
      
      streamRef.current = stream;
      
      // Crear contexto de audio con configuración optimizada
      audioContextRef.current = new AudioContext({
        sampleRate: VAD_CONFIG.sampleRate,
      });
      
      // Crear y configurar analizador
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = VAD_CONFIG.fftSize;
      analyserRef.current.smoothingTimeConstant = VAD_CONFIG.smoothingTimeConstant;
      analyserRef.current.minDecibels = VAD_CONFIG.minDecibels;
      analyserRef.current.maxDecibels = VAD_CONFIG.maxDecibels;

      // Conectar stream al analizador
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Resetear estado
      stateRef.current = {
        speechStartTime: 0,
        lastVoiceTime: 0,
        isSpeaking: false,
        consecutiveVoiceFrames: 0,
        consecutiveSilenceFrames: 0,
      };
      
      bufferRef.current = {
        samples: [],
        timestamps: [],
        confidence: [],
        maxSize: 50
      };

      setIsListening(true);
      setVadState('detecting');
      
      // Iniciar análisis después de un breve delay
      setTimeout(() => {
        if (isListening) {
          analyzeVoiceActivity();
          console.log('🎤 VAD analysis loop started');
        }
      }, 100);
      
      console.log('🎤 VAD initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to start voice activity detection:', error);
      throw error;
    }
  }, [isListening, analyzeVoiceActivity]);

  const stopListening = useCallback(() => {
    console.log('🛑 Stopping voice activity detection...');
    
    // Limpiar timeouts
    Object.values(timeoutsRef.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    timeoutsRef.current = {};
    
    // Parar animación
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Cerrar stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Cerrar contexto de audio
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    setIsListening(false);
    setVadState('idle');
    setConfidence(0);
    
    // Resetear estado
    stateRef.current = {
      speechStartTime: 0,
      lastVoiceTime: 0,
      isSpeaking: false,
      consecutiveVoiceFrames: 0,
      consecutiveSilenceFrames: 0,
    };
  }, []);

  // Main VAD control logic
  useEffect(() => {
    const shouldVADBeActive = (
      state.isCallActive &&
      !state.isMuted &&
      state.phase === 'listening' &&
      state.avatarConnected
    );

    console.log('🎤 VAD activation check:', {
      shouldVADBeActive,
      isCallActive: state.isCallActive,
      isMuted: state.isMuted,
      phase: state.phase,
      avatarConnected: state.avatarConnected,
      currentlyListening: isListening,
      singletonActive: vadSingletonRef.current
    });

    if (shouldVADBeActive && !isListening && !vadSingletonRef.current && !initializationLockRef.current) {
      console.log('🎤 Starting unified VAD');
      initializationLockRef.current = true;
      vadSingletonRef.current = true;
      startListening().finally(() => {
        initializationLockRef.current = false;
      });
    } else if (!shouldVADBeActive && isListening && !initializationLockRef.current) {
      console.log('🎤 Stopping unified VAD');
      vadSingletonRef.current = false;
      stopListening();
    }
  }, [state.isCallActive, state.isMuted, state.phase, state.avatarConnected, isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadSingletonRef.current) {
        stopListening();
        vadSingletonRef.current = false;
      }
    };
  }, [stopListening]);

  return {
    vad: {
      isListening,
      vadState,
      confidence,
      startListening,
      stopListening,
      isVoiceActive: stateRef.current.isSpeaking,
    },
    recorder,
    isVADActive: isListening,
  };
};
