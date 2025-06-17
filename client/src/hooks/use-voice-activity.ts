
import { useState, useEffect, useRef, useCallback } from 'react';

// Configuración optimizada para conversación fluida
const VAD_CONFIG = {
  fftSize: 2048,              // Mejor resolución frecuencial
  smoothingTimeConstant: 0.2,  // Más suave para evitar fluctuaciones
  minDecibels: -60,           // Más sensible a audio bajo
  maxDecibels: -10,           // Rango dinámico amplio
  sampleRate: 16000,          // Óptimo para voz
  bufferSize: 4096,           // Buffer más grande para estabilidad
  
  // Thresholds críticos
  voiceThreshold: 15,         // RMS mínimo para detectar voz
  silenceThreshold: 8,        // RMS máximo para considerar silencio
  
  // Tiempos de estabilización
  speechStartDelay: 150,      // ms antes de confirmar inicio de habla
  speechEndDelay: 1200,       // ms de silencio antes de terminar
  minimumSpeechDuration: 500, // ms mínimos de habla válida
  
  // Filtros de frecuencia para voz humana
  voiceFreqMin: 85,           // Hz - frecuencia mínima voz humana
  voiceFreqMax: 3400,         // Hz - frecuencia máxima voz humana
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
    if (!analyserRef.current) return;

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

    // Detección de voz mejorada
    const isVoiceDetected = rms > VAD_CONFIG.voiceThreshold && voiceRatio > 0.3;
    const isSilence = rms < VAD_CONFIG.silenceThreshold;
    
    const state = stateRef.current;
    
    if (isVoiceDetected) {
      state.lastVoiceTime = currentTime;
      state.consecutiveVoiceFrames++;
      state.consecutiveSilenceFrames = 0;
      
      // Confirmar inicio de habla con delay
      if (!state.isSpeaking && state.consecutiveVoiceFrames > 3) {
        if (timeoutsRef.current.start) {
          clearTimeout(timeoutsRef.current.start);
        }
        
        timeoutsRef.current.start = setTimeout(() => {
          if (!state.isSpeaking) {
            console.log('🎤 Speech confirmed - starting recording');
            state.isSpeaking = true;
            state.speechStartTime = currentTime;
            setVadState('speaking');
            onSpeechStart?.();
            onVoiceActivity?.(true);
          }
        }, speechStartThreshold);
      }
      
    } else if (isSilence) {
      state.consecutiveSilenceFrames++;
      state.consecutiveVoiceFrames = 0;
      
      // Confirmar final de habla con delay más largo
      if (state.isSpeaking && state.consecutiveSilenceFrames > 5) {
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
              
              // Cooldown breve antes de volver a detectar
              setTimeout(() => {
                setVadState('detecting');
              }, 300);
            }
          }, 100);
        }
      }
    }

    // Continuar análisis si está escuchando
    if (isListening) {
      animationFrameRef.current = requestAnimationFrame(analyzeVoiceActivity);
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
        analyzeVoiceActivity();
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
