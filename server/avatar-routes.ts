import type { Express } from "express";
import { HeyGenService } from "./heygen-service.js";
import { FallbackAvatarService } from "./fallback-avatar-service.js";
import path from "path";
import fs from "fs";
import { HeyGenSessionManager } from './session-manager.js';

export function addAvatarRoutes(app: Express) {
  const heygenService = new HeyGenService();
  const fallbackService = new FallbackAvatarService();
  const sessionManager = new HeyGenSessionManager(heygenService);

  // Validar estado de sesión antes de usar
  async function validateSessionHealth(sessionId: string): Promise<boolean> {
    try {
      console.log(`🔍 Validando salud de sesión: ${sessionId}`);

      // Test TTS mínimo para verificar que la sesión está activa
      const testResponse = await fetch(`https://api.heygen.com/v1/streaming.task`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HEYGEN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          text: "test",
          task_type: 'repeat'
        }),
      });

      const isHealthy = testResponse.ok;
      console.log(`${isHealthy ? '✅' : '❌'} Sesión ${sessionId} health: ${isHealthy}`);
      return isHealthy;
    } catch (error) {
      console.error(`❌ Error validando sesión ${sessionId}: ${error}`);
      return false;
    }
  }

  // Establecer WebRTC con retry logic
  async function establishWebRTCConnection(sessionData: any, maxRetries = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Intento ${attempt}/${maxRetries} - Estableciendo WebRTC para ${sessionData.sessionId}`);

        await heygenService.startSession(sessionData.sessionId);

        // Verificar que la sesión responde correctamente después de start
        const isHealthy = await validateSessionHealth(sessionData.sessionId);

        if (isHealthy) {
          console.log(`✅ WebRTC establecido exitosamente para ${sessionData.sessionId}`);
          return true;
        } else {
          console.warn(`⚠️ Sesión ${sessionData.sessionId} no pasó validación post-start`);
        }
      } catch (error) {
        console.error(`❌ Error en intento ${attempt}: ${error}`);

        if (attempt < maxRetries) {
          const backoffDelay = attempt * 1000; // 1s, 2s, 3s
          console.log(`⏳ Esperando ${backoffDelay}ms antes del siguiente intento...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }

    console.error(`❌ Falló establecer WebRTC después de ${maxRetries} intentos`);
    return false;
  }

  // Test completo end-to-end
  async function testCompleteAvatarPipeline(sessionId: string): Promise<boolean> {
    try {
      console.log(`🧪 Ejecutando test completo para sesión: ${sessionId}`);

      // 1. Validar sesión activa
      const isHealthy = await validateSessionHealth(sessionId);
      if (!isHealthy) {
        console.error('❌ Test falló: Sesión no está saludable');
        return false;
      }

      // 2. Test TTS de prueba
      console.log('🎯 Enviando TTS de prueba...');
      await heygenService.sendTextToSpeech("Hola, soy el Dr. Carlos", sessionId);

      // 3. Esperar respuesta
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. Validar que aún está activa
      const stillHealthy = await validateSessionHealth(sessionId);
      if (!stillHealthy) {
        console.error('❌ Test falló: Sesión se desconectó después de TTS');
        return false;
      }

      console.log('✅ Test completo exitoso - Avatar pipeline funcionando');
      return true;
    } catch (error) {
      console.error(`❌ Test completo falló: ${error}`);
      return false;
    }
  }

  // Crear sesión con retry inteligente
  async function createRobustHeyGenSession(avatarId?: string, maxRetries = 2): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🚀 Intento ${attempt}/${maxRetries} - Creando sesión HeyGen robusta`);

        // Crear sesión
        const sessionData = await heygenService.createStreamingSession(avatarId);
        console.log(`✅ Sesión creada: ${sessionData.sessionId}`);

        // Establecer WebRTC
        const webrtcSuccess = await establishWebRTCConnection(sessionData);
        if (!webrtcSuccess) {
          console.warn(`⚠️ WebRTC falló para ${sessionData.sessionId}, intentando nueva sesión...`);
          await heygenService.closeSession(sessionData.sessionId);
          continue;
        }

        // Test completo
        const pipelineSuccess = await testCompleteAvatarPipeline(sessionData.sessionId);
        if (!pipelineSuccess) {
          console.warn(`⚠️ Pipeline test falló para ${sessionData.sessionId}, intentando nueva sesión...`);
          await heygenService.closeSession(sessionData.sessionId);
          continue;
        }

        console.log(`🎉 SESIÓN HEYGEN ROBUSTA CREADA Y VALIDADA: ${sessionData.sessionId}`);
        return sessionData;

      } catch (error) {
        console.error(`❌ Error en intento ${attempt}: ${error}`);

        if (attempt < maxRetries) {
          console.log(`⏳ Esperando antes del siguiente intento...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    throw new Error(`❌ Falló crear sesión HeyGen robusta después de ${maxRetries} intentos`);
  }

  // Monitoreo en tiempo real
  const activeSessionsHealth = new Map<string, NodeJS.Timeout>();

  function startHealthMonitoring(sessionId: string) {
    console.log(`🔍 Iniciando monitoreo de salud para ${sessionId}`);

    const healthCheck = setInterval(async () => {
      try {
        const isHealthy = await validateSessionHealth(sessionId);
        if (!isHealthy) {
          console.warn(`⚠️ Sesión ${sessionId} perdió salud - requiere reconexión`);
          clearInterval(healthCheck);
          activeSessionsHealth.delete(sessionId);
        }
      } catch (error) {
        console.error(`❌ Error en health check para ${sessionId}: ${error}`);
      }
    }, 30000); // Check cada 30 segundos

    activeSessionsHealth.set(sessionId, healthCheck);
  }

  function stopHealthMonitoring(sessionId: string) {
    const healthCheck = activeSessionsHealth.get(sessionId);
    if (healthCheck) {
      clearInterval(healthCheck);
      activeSessionsHealth.delete(sessionId);
      console.log(`🛑 Detenido monitoreo de salud para ${sessionId}`);
    }
  }
  
  // Create avatar token for session hygiene
  app.post("/api/avatar/token", async (req, res) => {
    try {
      const token = await heygenService.createHeygenToken();
      
      res.json({
        success: true,
        token: token
      });
    } catch (error) {
      console.error('Avatar token creation error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create avatar token",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Close avatar session with token
  app.post("/api/avatar/close-token", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({
          success: false,
          message: "Token is required"
        });
      }

      await heygenService.closeHeygen(token);
      
      res.json({
        success: true,
        message: "Avatar session closed with token"
      });
    } catch (error) {
      console.error('Avatar token close error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to close avatar session with token",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Routes
  app.post("/api/avatar/session", async (req, res) => {
    try {
      const { avatarId } = req.body;

      console.log('🎯 CREANDO SESIÓN HEYGEN ROBUSTA CON VALIDACIÓN COMPLETA...');

      const sessionData = await createRobustHeyGenSession(avatarId);

      // Iniciar monitoreo de salud
      startHealthMonitoring(sessionData.sessionId);

      res.json({
        success: true,
        data: {
          sessionId: sessionData.sessionId,
          previewUrl: sessionData.previewUrl,
          streamUrl: sessionData.streamUrl,
          isHeyGen: true,
          isReal: true,
          isReady: true,
          isValidated: true,
          webrtcEstablished: true
        }
      });
    } catch (error) {
      console.error('❌ FALLÓ CREACIÓN DE SESIÓN ROBUSTA:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create robust HeyGen session",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/avatar/start", async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "SessionId is required"
        });
      }

      console.log(`🚀 Iniciando sesión validada: ${sessionId}`);

      // La sesión ya fue validada en /session, aquí solo confirmamos
      const isHealthy = await validateSessionHealth(sessionId);
      if (!isHealthy) {
        return res.status(400).json({
          success: false,
          message: "Session is not ready for streaming",
          requiresReconnection: true
        });
      }

      sessionManager.updateActivity(sessionId);

      res.json({
        success: true,
        message: "Avatar session started successfully"
      });
    } catch (error) {
      console.error('❌ Avatar start error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to start avatar session",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/avatar/speak", async (req, res) => {
    try {
      const { text, sessionId } = req.body;

      if (!sessionId || !text) {
        return res.status(400).json({
          success: false,
          message: "SessionId and text are required"
        });
      }

      console.log(`🎤 Enviando TTS con validación previa: "${text}"`);

      // Validar sesión antes de enviar TTS
      const isHealthy = await validateSessionHealth(sessionId);
      if (!isHealthy) {
        return res.status(400).json({
          success: false,
          message: "Session is not healthy for TTS",
          requiresReconnection: true
        });
      }

      // Enviar TTS
      await heygenService.sendTextToSpeech(text, sessionId);
      sessionManager.updateActivity(sessionId);

      res.json({
        success: true,
        message: "Text sent to avatar successfully"
      });
    } catch (error) {
      console.error('❌ Avatar speak error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to send text to avatar",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/avatar/greet", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "SessionId is required"
        });
      }

      await heygenService.sendGreeting(sessionId);
      
      res.json({
        success: true,
        message: "Greeting sent to avatar"
      });
    } catch (error) {
      console.error('Avatar greeting error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to send greeting",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/avatar/close", async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "SessionId is required"
        });
      }

      console.log(`🛑 Cerrando sesión: ${sessionId}`);

      // Detener monitoreo
      stopHealthMonitoring(sessionId);

      // Cerrar sesión
      await sessionManager.closeSession(sessionId);

      res.json({
        success: true,
        message: "Avatar session closed successfully"
      });
    } catch (error) {
      console.error('❌ Avatar close error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to close avatar session",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get avatar preview image - serve direct SVG for reliable display
  app.get("/api/avatar/preview/:avatarId", async (req, res) => {
    try {
      const { avatarId } = req.params;
      
      // Validate avatar with HeyGen API first
      let isValidAvatar = false;
      try {
        const apiKey = process.env.HEYGEN_API_KEY;
        if (apiKey) {
          const testResponse = await fetch('https://api.heygen.com/v1/streaming.new', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              avatar_name: avatarId,
              quality: 'low'
            }),
          });

          if (testResponse.ok) {
            const data = await testResponse.json() as any;
            console.log(`Authentic HeyGen avatar ${avatarId} validated`);
            isValidAvatar = true;
            
            // Close test session immediately
            if (data.data?.session_id) {
              fetch('https://api.heygen.com/v1/streaming.stop', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  session_id: data.data.session_id
                }),
              }).catch(() => {});
            }
          }
        }
      } catch (error) {
        console.log(`HeyGen API validation for ${avatarId}:`, error);
      }
      
      // Return professional SVG avatar that always displays
      const avatarSvg = `
        <svg width="400" height="500" viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#1D4ED8;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#3B82F6;stop-opacity:1" />
            </linearGradient>
            <linearGradient id="suit" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#1F2937;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#374151;stop-opacity:1" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          <!-- Background with validation status -->
          <rect width="400" height="500" fill="url(#bg)"/>
          
          <!-- Professional suit body -->
          <path d="M 120 280 Q 200 250 280 280 L 280 500 L 120 500 Z" fill="url(#suit)"/>
          
          <!-- White shirt -->
          <path d="M 160 280 Q 200 260 240 280 L 240 420 L 160 420 Z" fill="#FFFFFF"/>
          
          <!-- Tie -->
          <rect x="190" y="280" width="20" height="140" fill="#DC2626"/>
          
          <!-- Face with professional appearance -->
          <circle cx="200" cy="180" r="50" fill="#F3E8D0"/>
          
          <!-- Hair -->
          <path d="M 150 160 Q 200 130 250 160 Q 240 140 200 140 Q 160 140 150 160" fill="#374151"/>
          
          <!-- Glasses for professional look -->
          <rect x="175" y="165" width="50" height="25" fill="none" stroke="#1F2937" stroke-width="2" rx="5"/>
          <line x1="200" y1="170" x2="200" y2="175" stroke="#1F2937" stroke-width="2"/>
          
          <!-- Eyes -->
          <circle cx="185" cy="175" r="3" fill="#1F2937"/>
          <circle cx="215" cy="175" r="3" fill="#1F2937"/>
          
          <!-- Nose -->
          <path d="M 198 185 L 202 185 L 200 190 Z" fill="#E5B684"/>
          
          <!-- Professional smile -->
          <path d="M 190 200 Q 200 205 210 200" stroke="#1F2937" stroke-width="2" fill="none"/>
          
          <!-- Medical badge -->
          <rect x="250" y="320" width="40" height="25" fill="#FFFFFF" stroke="#1F2937" stroke-width="1" rx="3"/>
          <text x="270" y="335" font-family="Arial, sans-serif" font-size="8" fill="#1F2937" text-anchor="middle">MD</text>
          
          <!-- Stethoscope -->
          <path d="M 170 300 Q 180 290 190 300" stroke="#374151" stroke-width="3" fill="none"/>
          <circle cx="170" cy="300" r="8" fill="#374151"/>
          
          <!-- Professional info panel -->
          <rect x="20" y="400" width="360" height="80" fill="rgba(0,0,0,0.8)" rx="10"/>
          <text x="200" y="425" font-family="Arial, sans-serif" font-size="22" fill="#FFFFFF" text-anchor="middle" font-weight="bold">Dr. Carlos Mendoza</text>
          <text x="200" y="445" font-family="Arial, sans-serif" font-size="14" fill="#E5E7EB" text-anchor="middle">Psicólogo Clínico Especializado</text>
          <text x="200" y="460" font-family="Arial, sans-serif" font-size="12" fill="#9CA3AF" text-anchor="middle">Consultas de Salud Mental con IA</text>
          
          <!-- Validation badge -->
          ${isValidAvatar ? `
            <rect x="280" y="40" width="100" height="30" fill="rgba(34,197,94,0.9)" rx="15"/>
            <circle cx="295" cy="55" r="3" fill="#FFFFFF"/>
            <text x="340" y="58" font-family="Arial, sans-serif" font-size="10" fill="#FFFFFF" text-anchor="middle">HeyGen ✓</text>
          ` : `
            <rect x="280" y="40" width="100" height="30" fill="rgba(239,68,68,0.9)" rx="15"/>
            <text x="330" y="58" font-family="Arial, sans-serif" font-size="10" fill="#FFFFFF" text-anchor="middle">Validating...</text>
          `}
          
          <!-- Avatar ID -->
          <text x="200" y="475" font-family="Arial, sans-serif" font-size="10" fill="#6B7280" text-anchor="middle">ID: ${avatarId}</text>
        </svg>
      `;
      
      res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
      });
      res.send(avatarSvg);
      
    } catch (error) {
      console.error('Avatar preview error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get avatar preview"
      });
    }
  });

  // Get available avatars
  app.get("/api/avatar/list", async (req, res) => {
    try {
      const avatars = await heygenService.getAvatarList();
      
      res.json({
        success: true,
        avatars: avatars.map(id => ({
          id,
          name: `Avatar ${id}`,
          previewUrl: `/api/avatar/preview/${id}`
        }))
      });
    } catch (error) {
      console.error('Avatar list error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get avatar list"
      });
    }
  });

  // Cleanup al shutdown
  process.on('SIGINT', () => {
    console.log('🧹 Limpiando monitoreo de salud...');
    for (const [sessionId, healthCheck] of activeSessionsHealth.entries()) {
      clearInterval(healthCheck);
    }
    activeSessionsHealth.clear();
  });
}