import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { IStorage } from "./storage.js";

export interface PsychologicalSession {
  sessionId: string;
  phase: 'intake' | 'assessment' | 'diagnosis' | 'treatment' | 'followup';
  symptoms: string[];
  concerns: string[];
  riskFactors: string[];
  diagnosis?: string;
  treatmentPlan?: string[];
  sessionNotes: string[];
}

export class PsychologicalAgent {
  private llm: ChatGroq;
  private storage: IStorage;
  private sessions: Map<string, PsychologicalSession> = new Map();

  constructor(storage: IStorage) {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      maxTokens: 800,
    });
    this.storage = storage;
  }

  private getSystemPrompt(): string {
    return `Eres el Dr. Elena Martínez, una psicóloga clínica con 15 años de experiencia especializada en terapia cognitivo-conductual y evaluación psicológica.

PROTOCOLO DE CONSULTA PSICOLÓGICA:

1. FASE DE BIENVENIDA E INTAKE (primeros mensajes):
   - Saluda cordialmente y presenta tu experiencia profesional
   - Explica la confidencialidad y el proceso terapéutico
   - Pregunta por el motivo de consulta principal
   - Haz que el paciente se sienta cómodo y escuchado

2. FASE DE EVALUACIÓN SISTEMÁTICA:
   - Historia del problema actual (cuándo comenzó, factores desencadenantes)
   - Síntomas específicos y su frecuencia/intensidad
   - Impacto en la vida diaria (trabajo, relaciones, sueño, apetito)
   - Antecedentes médicos y psicológicos
   - Historia familiar de problemas mentales
   - Uso de sustancias o medicamentos
   - Factores de estrés actuales

3. EVALUACIÓN DE RIESGO:
   - Pensamientos suicidas o de autolesión
   - Riesgo para otros
   - Funcionalidad general

4. TÉCNICAS DE EVALUACIÓN:
   - Preguntas abiertas: "¿Puedes contarme más sobre...?"
   - Escalas de 1-10 para intensidad de síntomas
   - Técnicas de clarificación y parafraseo
   - Validación emocional

5. DIAGNÓSTICO Y TRATAMIENTO:
   - Basado en criterios DSM-5
   - Explicación clara y comprensible para el paciente
   - Plan de tratamiento personalizado
   - Técnicas terapéuticas específicas

DIRECTRICES ÉTICAS:
- Mantén siempre una actitud empática y no juzgante
- Usa lenguaje profesional pero accesible
- Respeta los límites éticos de una consulta virtual
- En casos de riesgo grave, recomienda atención presencial inmediata
- Nunca prescribas medicamentos (solo psicólogos/psiquiatras pueden hacerlo)

ESTILO DE COMUNICACIÓN:
- Cálido pero profesional
- Haz una pregunta específica por respuesta
- Usa técnicas de escucha activa
- Valida las emociones del paciente
- Mantén esperanza y perspectiva terapéutica

Responde SIEMPRE en español y actúa como si fueras un psicólogo real en consulta.`;
  }

  async processMessage(sessionId: string, userMessage: string): Promise<string> {
    // Obtener o crear sesión psicológica
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        phase: 'intake',
        symptoms: [],
        concerns: [],
        riskFactors: [],
        sessionNotes: []
      };
      this.sessions.set(sessionId, session);
    }

    // Obtener historial de mensajes recientes
    const recentMessages = await this.storage.getRecentMessages(sessionId, 10);
    
    // Construir contexto conversacional
    const messages: BaseMessage[] = [
      new SystemMessage(this.getSystemPrompt())
    ];

    // Agregar historial de conversación
    recentMessages.forEach(msg => {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content));
      }
    });

    // Agregar mensaje actual del usuario
    messages.push(new HumanMessage(userMessage));

    // Procesar con LangChain
    const response = await this.llm.invoke(messages);
    const responseText = response.content as string;

    // Analizar respuesta para actualizar estado de sesión
    this.updateSessionState(session, userMessage, responseText);

    return responseText;
  }

  private updateSessionState(session: PsychologicalSession, userInput: string, response: string): void {
    // Análisis simple de patrones para actualizar estado
    const lowerInput = userInput.toLowerCase();
    
    // Detectar síntomas mencionados
    const symptomKeywords = [
      'ansiedad', 'depresión', 'estrés', 'miedo', 'pánico', 'tristeza', 
      'preocupación', 'insomnio', 'fatiga', 'irritabilidad', 'llanto',
      'pensamientos', 'obsesiones', 'compulsiones', 'fobias'
    ];

    symptomKeywords.forEach(symptom => {
      if (lowerInput.includes(symptom) && !session.symptoms.includes(symptom)) {
        session.symptoms.push(symptom);
      }
    });

    // Detectar factores de riesgo
    const riskKeywords = [
      'suicidio', 'autolesión', 'muerte', 'hacerme daño', 'acabar con todo',
      'no vale la pena', 'mejor muerto', 'plan', 'pastillas'
    ];

    riskKeywords.forEach(risk => {
      if (lowerInput.includes(risk) && !session.riskFactors.includes(risk)) {
        session.riskFactors.push(risk);
        session.phase = 'assessment'; // Escalate to assessment if risk detected
      }
    });

    // Agregar nota de sesión
    session.sessionNotes.push(`Usuario: ${userInput.substring(0, 100)}...`);
    session.sessionNotes.push(`Respuesta: ${response.substring(0, 100)}...`);

    // Mantener solo las últimas 20 notas
    if (session.sessionNotes.length > 20) {
      session.sessionNotes = session.sessionNotes.slice(-20);
    }
  }

  getSessionState(sessionId: string): PsychologicalSession | undefined {
    return this.sessions.get(sessionId);
  }

  // Método para obtener resumen de la sesión
  getSessionSummary(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return "No hay sesión activa";

    return `
Resumen de Sesión - ${sessionId}:
- Fase actual: ${session.phase}
- Síntomas identificados: ${session.symptoms.join(', ') || 'Ninguno registrado'}
- Factores de riesgo: ${session.riskFactors.length > 0 ? 'PRESENTES' : 'No detectados'}
- Notas de sesión: ${session.sessionNotes.length} entradas
    `.trim();
  }
}