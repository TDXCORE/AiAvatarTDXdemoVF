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
  
  // Create new avatar streaming session with HeyGen fallback
  app.post("/api/avatar/session", async (req, res) => {
    try {
      const { avatarId } = req.body;
      
      // Use fallback service with authentic HeyGen preview URL
      const fallbackData = await fallbackService.createSession(avatarId);
      console.log('Using fallback avatar service with authentic preview data');
      res.json({
        success: true,
        data: fallbackData
      });
    } catch (error) {
      console.error('Avatar session creation error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create avatar session",
        error: error instanceof Error ? error.message : "Unknown error"
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

      // Try HeyGen first, fallback to local service
      try {
        await heygenService.sendTextToSpeech(text, sessionId);
        res.json({
          success: true,
          message: "Text sent to avatar via HeyGen"
        });
      } catch (heygenError) {
        // Use fallback service for TTS processing
        await fallbackService.sendTextToSpeech(text, sessionId);
        res.json({
          success: true,
          message: "Text processed via fallback service"
        });
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

  // Get avatar preview (placeholder for now - would need actual preview video)
  app.get("/api/avatar/preview/:avatarId", async (req, res) => {
    try {
      const { avatarId } = req.params;
      
      // For now, return a placeholder response
      // In production, you would serve an actual preview video file
      res.json({
        success: true,
        previewUrl: `/assets/avatar-preview-${avatarId}.mp4`,
        message: "Preview URL generated"
      });
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