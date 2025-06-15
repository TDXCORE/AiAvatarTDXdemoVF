import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertConversationSchema, insertMessageSchema } from "@shared/schema";
import multer from "multer";

// Configure multer for audio file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for audio files
  },
  fileFilter: (req, file, cb) => {
    // Accept WAV and WebM files
    if (file.mimetype === 'audio/wav' || file.mimetype === 'audio/webm') {
      cb(null, true);
    } else {
      cb(new Error('Only WAV and WebM audio files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Get or create conversation
  app.post("/api/conversations", async (req, res) => {
    try {
      const { sessionId } = insertConversationSchema.parse(req.body);
      
      // Check if conversation already exists
      let conversation = await storage.getConversation(sessionId);
      
      if (!conversation) {
        conversation = await storage.createConversation({ sessionId });
      }
      
      res.json(conversation);
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Invalid conversation data" 
      });
    }
  });

  // Get messages for a conversation
  app.get("/api/conversations/:sessionId/messages", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const messages = await storage.getMessages(sessionId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch messages" 
      });
    }
  });

  // Speech-to-Text transcription endpoint
  app.post("/api/transcribe", upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const groqApiKey = process.env.GROQ_API_KEY;
      const startTime = Date.now();

      if (!groqApiKey) {
        return res.status(500).json({ message: "Groq API key not configured" });
      }

      // Create FormData for Groq API
      const formData = new FormData();
      formData.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), 'audio.wav');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', req.body.language || 'en');
      formData.append('temperature', '0');

      // Call Groq Whisper API
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Groq API error:', errorText);
        return res.status(response.status).json({ 
          message: `Transcription failed: ${response.statusText}` 
        });
      }

      const transcriptionResult = await response.json();
      const processingTime = Date.now() - startTime;

      res.json({
        transcription: transcriptionResult.text || '',
        duration: transcriptionResult.duration || 0,
        processingTime,
      });

    } catch (error) {
      console.error('Transcription error:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Transcription failed" 
      });
    }
  });

  // LLM Agent processing endpoint
  app.post("/api/agent", async (req, res) => {
    try {
      const { inputText, sessionId } = req.body;
      
      if (!inputText || !sessionId) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const groqApiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_ENV_VAR;
      if (!groqApiKey) {
        return res.status(500).json({ message: "Groq API key not configured" });
      }

      // Get recent conversation context
      const recentMessages = await storage.getRecentMessages(sessionId, 6);
      
      // Build conversation context for LLM
      const conversationHistory = recentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Add current user message
      conversationHistory.push({
        role: "user",
        content: inputText
      });

      const startTime = Date.now();

      // Call Groq LLM API
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful AI voice assistant. Provide concise, conversational responses that work well for voice interaction. Keep responses under 100 words when possible.'
            },
            ...conversationHistory
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Groq LLM API error:', errorText);
        return res.status(response.status).json({ 
          message: `LLM processing failed: ${response.statusText}` 
        });
      }

      const llmResult = await response.json();
      const processingTime = Date.now() - startTime;

      const assistantReply = llmResult.choices?.[0]?.message?.content || "I apologize, but I couldn't generate a response.";

      // Store both user message and assistant reply
      await storage.addMessage({
        conversationId: sessionId,
        role: "user",
        content: inputText,
        isVoice: req.body.isVoice || false,
        audioData: req.body.audioData || null,
        metadata: {
          vadDetected: req.body.vadDetected || false,
          transcriptionDuration: req.body.transcriptionDuration || 0,
        }
      });

      await storage.addMessage({
        conversationId: sessionId,
        role: "assistant", 
        content: assistantReply,
        isVoice: false,
        metadata: {
          processingTime,
        }
      });

      res.json({
        replyText: assistantReply,
        processingTime,
        contextState: {
          messageCount: conversationHistory.length + 1
        }
      });

    } catch (error) {
      console.error('Agent processing error:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Agent processing failed" 
      });
    }
  });

  // Interrupt handling endpoint
  app.post("/api/interrupt", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID required" });
      }

      // In a real implementation, this would cancel ongoing processing
      // For now, we just acknowledge the interrupt
      res.json({ 
        success: true, 
        message: "Processing interrupted successfully" 
      });

    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to handle interrupt" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
