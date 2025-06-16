import type { Express } from "express";
import { HeyGenService } from "./heygen-service.js";
import { FallbackAvatarService } from "./fallback-avatar-service.js";
import path from "path";
import fs from "fs";

export function addAvatarRoutes(app: Express, heygenService: HeyGenService) {
  const fallbackService = new FallbackAvatarService();
  
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
  
  // Create new avatar streaming session - FORZAR HEYGEN REAL
  app.post("/api/avatar/session", async (req, res) => {
    try {
      const { avatarId } = req.body;
      
      // SOLO HEYGEN - NO FALLBACK
      console.log('🎯 FORZANDO CREACIÓN DE SESIÓN HEYGEN REAL...');
      
      const heygenData = await heygenService.createStreamingSession(avatarId);
      console.log('✅ SESIÓN HEYGEN REAL CREADA:', heygenData.sessionId);
      
      res.json({
        success: true,
        data: {
          sessionId: heygenData.sessionId,
          previewUrl: heygenData.previewUrl,
          streamUrl: heygenData.streamUrl,
          isHeyGen: true,
          isReal: true
        }
      });
    } catch (error) {
      console.error('❌ FALLÓ CREACIÓN DE SESIÓN HEYGEN:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create HeyGen session - NO FALLBACK ALLOWED",
        error: error instanceof Error ? error.message : "Unknown error",
        requiresReset: true
      });
    }
  });

  // Start avatar session (separate endpoint)
  app.post("/api/avatar/start", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "SessionId is required"
        });
      }

      await heygenService.startSession(sessionId);
      
      res.json({
        success: true,
        message: "Avatar session started"
      });
    } catch (error) {
      console.error('Avatar start error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to start avatar session",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Send text to avatar for speech with fallback
  app.post("/api/avatar/speak", async (req, res) => {
    try {
      const { text, sessionId } = req.body;
      
      if (!text || !sessionId) {
        return res.status(400).json({
          success: false,
          message: "Text and sessionId are required"
        });
      }

      // Check if it's a HeyGen session or fallback
      if (sessionId.startsWith('fallback_')) {
        await fallbackService.sendTextToSpeech(text, sessionId);
        res.json({
          success: true,
          message: "Text processed via fallback service"
        });
      } else {
        try {
          await heygenService.sendTextToSpeech(text, sessionId);
          res.json({
            success: true,
            message: "Text sent to avatar via HeyGen"
          });
        } catch (heygenError) {
          console.error('HeyGen TTS failed:', heygenError);
          res.status(500).json({
            success: false,
            message: "Failed to send text to HeyGen avatar",
            error: heygenError instanceof Error ? heygenError.message : "Unknown error"
          });
        }
      }
    } catch (error) {
      console.error('Avatar speak error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to send text to avatar",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Send greeting to avatar
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

  // Close avatar session
  app.post("/api/avatar/close", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "SessionId is required"
        });
      }

      await heygenService.closeSession(sessionId);
      
      res.json({
        success: true,
        message: "Avatar session closed"
      });
    } catch (error) {
      console.error('Avatar close error:', error);
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
}