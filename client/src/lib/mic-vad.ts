
import { MicVAD } from '@ricky0123/vad-web';

let instance: MicVAD | null = null;
let isInitializing = false;

// Callbacks for speech events
const speechStartCallbacks: (() => void)[] = [];
const speechEndCallbacks: ((audio: Float32Array) => void)[] = [];
const vadReadyCallbacks: (() => void)[] = [];
const vadMisfireCallbacks: (() => void)[] = [];

export interface MicVADConfig {
  baseAssetPath?: string;
  onnxWASMBasePath?: string;
  workletURL?: string;
  modelURL?: string;
  model?: 'v5' | 'legacy';
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  redemptionFrames?: number;
  frameSamples?: number;
  preSpeechPadFrames?: number;
  minSpeechFrames?: number;
}

export class MicVADSingleton {
  private static defaultConfig: MicVADConfig = {
    // Optimized configuration for Silero v5 and natural conversation
    model: 'v5',
    baseAssetPath: '/vad',
    onnxWASMBasePath: '/vad/',
    workletURL: '/vad/vad.worklet.bundle.min.js',
    modelURL: '/vad/silero_vad_v5.onnx',
    
    // Silero v5 optimized parameters for natural conversation
    frameSamples: 512,                    // v5 uses 512 instead of 1536
    positiveSpeechThreshold: 0.4,         // Sensitive but not too aggressive
    negativeSpeechThreshold: 0.35,        // Prevents premature cutoffs
    preSpeechPadFrames: 3,                // Captures natural speech start
    redemptionFrames: 24,                 // Allows natural pauses
    minSpeechFrames: 9,                   // Filters out short noises
  };

  static async getInstance(config?: Partial<MicVADConfig>): Promise<MicVAD> {
    if (instance) {
      return instance;
    }

    if (isInitializing) {
      // Wait for initialization to complete
      return new Promise((resolve) => {
        const checkInstance = () => {
          if (instance) {
            resolve(instance);
          } else {
            setTimeout(checkInstance, 100);
          }
        };
        checkInstance();
      });
    }

    isInitializing = true;
    console.log('🎤 Initializing MicVAD singleton with Silero v5...');

    try {
      const finalConfig = { ...this.defaultConfig, ...config };
      
      console.log('🎤 MicVAD Config:', {
        model: finalConfig.model,
        frameSamples: finalConfig.frameSamples,
        positiveSpeechThreshold: finalConfig.positiveSpeechThreshold,
        negativeSpeechThreshold: finalConfig.negativeSpeechThreshold,
        preSpeechPadFrames: finalConfig.preSpeechPadFrames,
        redemptionFrames: finalConfig.redemptionFrames,
        minSpeechFrames: finalConfig.minSpeechFrames
      });
      
      instance = await MicVAD.new({
        // Asset paths - using correct property names
        baseAssetPath: finalConfig.baseAssetPath,
        onnxWASMBasePath: finalConfig.onnxWASMBasePath,
        
        // Model configuration
        model: finalConfig.model,
        frameSamples: finalConfig.frameSamples,
        
        // Speech detection thresholds
        positiveSpeechThreshold: finalConfig.positiveSpeechThreshold,
        negativeSpeechThreshold: finalConfig.negativeSpeechThreshold,
        redemptionFrames: finalConfig.redemptionFrames,
        preSpeechPadFrames: finalConfig.preSpeechPadFrames,
        minSpeechFrames: finalConfig.minSpeechFrames,
        
        // Event callbacks
        onSpeechStart: () => {
          console.log('🎤 MicVAD: Speech started (Silero v5)');
          speechStartCallbacks.forEach(cb => cb());
        },
        
        onSpeechEnd: (audio: Float32Array) => {
          console.log('🎤 MicVAD: Speech ended, audio samples:', audio.length, 'duration:', (audio.length / 16000).toFixed(2) + 's');
          speechEndCallbacks.forEach(cb => cb(audio));
        },
        
        onVADMisfire: () => {
          console.log('🎤 MicVAD: VAD misfire detected (speech too short)');
          vadMisfireCallbacks.forEach(cb => cb());
        },
        
        onFrameProcessed: (probabilities) => {
          // Optional: Log frame processing for debugging
          // console.log('🎤 Frame processed:', probabilities);
        }
      });

      console.log('✅ MicVAD singleton initialized successfully with Silero v5');
      vadReadyCallbacks.forEach(cb => cb());
      return instance;

    } catch (error) {
      console.error('❌ Failed to initialize MicVAD:', error);
      isInitializing = false;
      throw error;
    } finally {
      isInitializing = false;
    }
  }

  static async start(): Promise<void> {
    if (!instance) {
      throw new Error('MicVAD not initialized. Call getInstance() first.');
    }
    
    console.log('🎤 Starting MicVAD listening...');
    await instance.start();
  }

  static async pause(): Promise<void> {
    if (!instance) return;
    
    console.log('🎤 Pausing MicVAD...');
    await instance.pause();
  }

  static async destroy(): Promise<void> {
    if (!instance) return;
    
    console.log('🛑 Destroying MicVAD singleton...');
    await instance.destroy();
    instance = null;
    isInitializing = false;
    
    // Clear all callbacks
    speechStartCallbacks.length = 0;
    speechEndCallbacks.length = 0;
    vadReadyCallbacks.length = 0;
  }

  static isReady(): boolean {
    return instance !== null && !isInitializing;
  }

  static isListening(): boolean {
    // Since listening property is private, we'll track state internally
    return instance !== null && !isInitializing;
  }

  // Event subscription methods
  static onSpeechStart(callback: () => void): () => void {
    speechStartCallbacks.push(callback);
    return () => {
      const index = speechStartCallbacks.indexOf(callback);
      if (index > -1) speechStartCallbacks.splice(index, 1);
    };
  }

  static onSpeechEnd(callback: (audio: Float32Array) => void): () => void {
    speechEndCallbacks.push(callback);
    return () => {
      const index = speechEndCallbacks.indexOf(callback);
      if (index > -1) speechEndCallbacks.splice(index, 1);
    };
  }

  static onReady(callback: () => void): () => void {
    if (instance) {
      callback(); // Call immediately if already ready
      return () => {};
    }
    
    vadReadyCallbacks.push(callback);
    return () => {
      const index = vadReadyCallbacks.indexOf(callback);
      if (index > -1) vadReadyCallbacks.splice(index, 1);
    };
  }

  // Utility method to convert Float32Array to WAV Blob
  static audioToWavBlob(audioData: Float32Array, sampleRate: number = 16000): Blob {
    const buffer = new ArrayBuffer(44 + audioData.length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + audioData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, audioData.length * 2, true);

    // Convert audio data
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}

export default MicVADSingleton;
