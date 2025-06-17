
import { useState, useEffect, useRef, useCallback } from 'react';

// Configuración VAD calibrada según guía quirúrgica
const VAD_CONFIG = {
  fftSize: 1024,              // Según guía
  smoothingTimeConstant: 0.12, // Según guía
  minDecibels: -60,           // Según guía
  maxDecibels: -5,            // Según guía
  sampleRate: 16000,          // Según guía
  bufferSize: 2048,           // Según guía
  
  // Thresholds calibrados según guía quirúrgica
  voiceThreshold: 7,          // Reducido de 12 → 7 (voces normales 5-9 RMS)
  silenceThreshold: 4,        // Reducido de 8 → 4 (2-3 puntos bajo voiceThreshold)
  
  // Tiempos optimizados según guía
  speechStartDelay: 80,       // Reducido de 120ms → 80ms (más ágil)
  speechEndDelay: 280,        // Reducido de 350ms → 280ms (acelera turnaround)
  cooldownDelay: 200,         // Reducido de 1000ms → 200ms (crítico: evita congelamiento)
  minimumSpeechDuration: 250, // Mantener para palabras cortas
  
  // Filtros de frecuencia según guía
  voiceFreqMin: 65,           // Según guía
  voiceFreqMax: 4000,         // Según guía
};

type VADState = 'idle' | 'detecting' | 'speaking' | 'ending' | 'cooldown';

interface VADBuffer {
  samples: number[];
  timestamps: number[];
  confidence: number[];
  maxSize: number;
}

interface VoiceActivityOptions {
  sensitivity?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onVoiceActivity?: (isActive: boolean) => void;
  speechStartThreshold?: number;
  speechEndThreshold?: number;
  minimumRecordingDuration?: number;
  autoRecordingEnabled?: boolean;
  continuousListening?: boolean;
}

export function useVoiceActivity(options: VoiceActivityOptions = {}) {
  const {
    sensitivity = 75,
    onSpeechStart,
    onSpeechEnd,
    onVoiceActivity,
    speechStartThreshold = 200,
    speechEndThreshold = 1500,
    minimumRecordingDuration = 800,
    autoRecordingEnabled = true,
    continuousListening = true,
  } = options;

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
    
    // Analizar solo frecuencias de voz humana (85Hz - 3400Hz)
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

  // Análisis inteligente de actividad de voz
  const analyzeVoiceActivity = useCallback(() => {
    if (!analyserRef.current || !isListening) {
      console.log('🎤 VAD analysis skipped - not ready or not listening');
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
    const overallConfidence = (rmsConfidence * 0.7 + freqConfidence * 0.3) * (sensitivity / 100);
    
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
    const isVoiceDetected = rms > VAD_CONFIG.voiceThreshold && voiceRatio > 0.10; // 10% energía vocal más realista
    const isSilence = rms < VAD_CONFIG.silenceThreshold;
    const isAmbientNoise = rms > VAD_CONFIG.silenceThreshold && rms < VAD_CONFIG.voiceThreshold;
    
    const state = stateRef.current;
    
    if (isVoiceDetected) {
      state.lastVoiceTime = currentTime;
      state.consecutiveVoiceFrames++;
      state.consecutiveSilenceFrames = 0;
      
      // Detectar primera sílaba inmediatamente
      if (!state.isSpeaking && state.consecutiveVoiceFrames >= 1) { // Era 2, ahora 1
        if (timeoutsRef.current.start) {
          clearTimeout(timeoutsRef.current.start);
        }
        
        timeoutsRef.current.start = setTimeout(() => {
          if (!state.isSpeaking && state.consecutiveVoiceFrames >= 2) {
            console.log('🎤 Speech confirmed - starting recording');
            state.isSpeaking = true;
            state.speechStartTime = currentTime;
            setVadState('speaking');
            onSpeechStart?.();
            onVoiceActivity?.(true);
          }
        }, speechStartThreshold);
      }
      
    } else if (isSilence || isAmbientNoise) {
      state.consecutiveSilenceFrames++;
      
      // Solo reducir frames de voz si hay silencio real
      if (isSilence) {
        state.consecutiveVoiceFrames = Math.max(0, state.consecutiveVoiceFrames - 1);
      }
      
      // Confirmar final de habla con más paciencia
      if (state.isSpeaking && state.consecutiveSilenceFrames >= 8) {
        const silenceDuration = currentTime - state.lastVoiceTime;
        const speechDuration = currentTime - state.speechStartTime;
        
        if (silenceDuration > speechEndThreshold && speechDuration > minimumRecordingDuration) {
          if (timeoutsRef.current.end) {
            clearTimeout(timeoutsRef.current.end);
          }
          
          timeoutsRef.current.end = setTimeout(() => {
            if (state.isSpeaking) {
              console.log('🎤 Speech ended - stopping recording');
              state.isSpeaking = false;
              setVadState('ending');
              onSpeechEnd?.();
              onVoiceActivity?.(false);
              
              // Cooldown más largo antes de volver a detectar para evitar activación prematura
              setTimeout(() => {
                if (isListening) {
                  setVadState('cooldown');
                  // Cooldown adicional antes de reactivar detección
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
    } else if (isListening && (!analyserRef.current || audioContextRef.current?.state !== 'running')) {
      console.warn('🎤 VAD analysis stopped - invalid audio context or analyser');
    }
  }, [
    sensitivity,
    speechStartThreshold,
    speechEndThreshold,
    minimumRecordingDuration,
    calculateRMS,
    analyzeVoiceFrequencies,
    onSpeechStart,
    onSpeechEnd,
    onVoiceActivity,
    isListening
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

  // Cleanup en desmontaje
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    vadState,
    confidence,
    startListening,
    stopListening,
    isVoiceActive: stateRef.current.isSpeaking,
  };
}
