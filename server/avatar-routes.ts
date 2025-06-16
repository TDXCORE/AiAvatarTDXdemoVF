import type { Express } from "express";
import { HeyGenService } from "./heygen-service.js";
import path from "path";

export function addAvatarRoutes(app: Express) {
  const heygenService = new HeyGenService();

  // Create avatar token for SDK initialization
  app.post("/api/avatar/token", async (req, res) => {
    try {
      console.log('🔑 Creating HeyGen token for SDK...');
      
      // Force cleanup before creating new token
      console.log('🧹 Cleaning up existing sessions first...');
      await heygenService.forceCleanupAllSessions();
      
      const token = await heygenService.createHeygenToken();
      
      if (!token) {
        throw new Error('Token creation returned empty result');
      }

      console.log('✅ HeyGen token created successfully');
      res.json({
        success: true,
        token: token
      });
    } catch (error) {
      console.error('❌ Avatar token creation error:', error);
      
      // Enhanced error response for concurrent limits
      let message = "Failed to create avatar token";
      if (error instanceof Error && error.message.includes('10007')) {
        message = "Session limit reached. Please wait a moment and try again.";
      }
      
      res.status(500).json({ 
        success: false,
        message: message,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Send text to avatar for TTS (from agent responses)
  app.post("/api/avatar/speak", async (req, res) => {
    try {
      const { text, sessionId } = req.body;

      if (!sessionId || !text) {
        return res.status(400).json({
          success: false,
          message: "SessionId and text are required"
        });
      }

      console.log(`🎤 Enviando respuesta del agente via SDK: "${text}"`);

      // For SDK implementation, we'll send this via the client-side SDK
      // This endpoint is maintained for compatibility but the actual TTS
      // will be handled by the streaming avatar SDK on the frontend

      res.json({
        success: true,
        message: "Text will be sent to avatar via SDK",
        text: text
      });
    } catch (error) {
      console.error('❌ Avatar speak error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to process text for avatar",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Close avatar session with token
  app.post("/api/avatar/close", async (req, res) => {
    try {
      const { token } = req.body;

      if (token) {
        await heygenService.closeHeygen(token);
      }

      res.json({
        success: true,
        message: "Avatar session cleanup completed"
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

  // Get avatar preview image
  app.get("/api/avatar/preview/:avatarId", async (req, res) => {
    try {
      const { avatarId } = req.params;

      // Return professional SVG avatar
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
          </defs>

          <rect width="400" height="500" fill="url(#bg)"/>
          <path d="M 120 280 Q 200 250 280 280 L 280 500 L 120 500 Z" fill="url(#suit)"/>
          <path d="M 160 280 Q 200 260 240 280 L 240 420 L 160 420 Z" fill="#FFFFFF"/>
          <rect x="190" y="280" width="20" height="140" fill="#DC2626"/>
          <circle cx="200" cy="180" r="50" fill="#F3E8D0"/>
          <path d="M 150 160 Q 200 130 250 160 Q 240 140 200 140 Q 160 140 150 160" fill="#374151"/>
          <rect x="175" y="165" width="50" height="25" fill="none" stroke="#1F2937" stroke-width="2" rx="5"/>
          <line x1="200" y1="170" x2="200" y2="175" stroke="#1F2937" stroke-width="2"/>
          <circle cx="185" cy="175" r="3" fill="#1F2937"/>
          <circle cx="215" cy="175" r="3" fill="#1F2937"/>
          <path d="M 198 185 L 202 185 L 200 190 Z" fill="#E5B684"/>
          <path d="M 190 200 Q 200 205 210 200" stroke="#1F2937" stroke-width="2" fill="none"/>

          <rect x="20" y="400" width="360" height="80" fill="rgba(0,0,0,0.8)" rx="10"/>
          <text x="200" y="425" font-family="Arial, sans-serif" font-size="22" fill="#FFFFFF" text-anchor="middle" font-weight="bold">Dr. Carlos Mendoza</text>
          <text x="200" y="445" font-family="Arial, sans-serif" font-size="14" fill="#E5E7EB" text-anchor="middle">Psicólogo Clínico con HeyGen SDK</text>
          <text x="200" y="460" font-family="Arial, sans-serif" font-size="12" fill="#9CA3AF" text-anchor="middle">Streaming Avatar Optimizado</text>
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