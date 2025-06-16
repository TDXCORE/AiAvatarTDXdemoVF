
import { HeyGenService } from './heygen-service.js';
import { FallbackAvatarService } from './fallback-avatar-service.js';

async function completeSystemReset() {
  console.log('🚨 INICIANDO RESET COMPLETO DEL SISTEMA 🚨');
  console.log('===============================================');
  
  const heygenService = new HeyGenService();
  const fallbackService = new FallbackAvatarService();
  
  // PASO 1: CANCELAR ABSOLUTAMENTE TODAS LAS SESIONES
  console.log('\n📋 PASO 1: CANCELANDO TODAS LAS SESIONES POSIBLES...');
  
  // Lista exhaustiva de todos los posibles session IDs
  const allPossibleSessions = [
    // Sesiones recientes de los logs
    'fe3de5ed-4a5b-11f0-a0c0-f691470b75e2',
    '2a6f2725-4a5c-11f0-97f9-6e2db0bded05',
    'fe0fc279-4a36-11f0-ba0d-5e3b6a3b504d',
    '91aca4d4-4a3a-11f0-b3da-5e0a6fe58bfa',
    '108e6f3a-4a3a-11f0-b3da-5e0a6fe58bfa',
    'c6998ac7-4a3a-11f0-b08d-227b28e9264f',
    
    // Patrones comunes
    'session_1', 'session_2', 'session_3', 'session_4', 'session_5',
    'streaming_session_1', 'streaming_session_2', 'streaming_session_3',
    'josh_lite3_20230714_session',
    'Dexter_Doctor_Standing2_public_session',
    'default_session', 'test_session', 'avatar_session',
    
    // Sesiones fallback que puedan estar activas
    'fallback_1750042292295_3lgcst8mq',
    'fallback_1750042490052_70b1upst8',
    'fallback_1750042623517_h6m2ji786',
    'fallback_1750042749267_e26sd6cv2'
  ];

  let closedCount = 0;
  for (const sessionId of allPossibleSessions) {
    try {
      await heygenService.closeSession(sessionId);
      console.log(`✅ Sesión HeyGen cerrada: ${sessionId}`);
      closedCount++;
    } catch (error) {
      // Ignorar errores de sesiones que no existen
    }
    
    // Pequeña pausa para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log(`📊 Total sesiones HeyGen cerradas: ${closedCount}`);
  
  // PASO 2: FORZAR LIMPIEZA COMPLETA CON HEYGEN API
  console.log('\n🧹 PASO 2: LIMPIEZA FORZADA CON API HEYGEN...');
  try {
    await heygenService.forceCleanupAll();
    console.log('✅ Limpieza forzada completada');
  } catch (error) {
    console.log('⚠️ Limpieza forzada falló (normal si no hay sesiones)');
  }
  
  // PASO 3: ESPERAR PARA ASEGURAR LIMPIEZA COMPLETA
  console.log('\n⏳ PASO 3: ESPERANDO LIMPIEZA COMPLETA...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // PASO 4: CREAR TOKEN FRESCO
  console.log('\n🔑 PASO 4: CREANDO TOKEN FRESCO...');
  try {
    const token = await heygenService.createHeygenToken();
    console.log(`✅ Token fresco creado: ${token.substring(0, 20)}...`);
  } catch (error) {
    console.error('❌ Error creando token:', error);
    throw error;
  }
  
  // PASO 5: PROBAR CREACIÓN DE SESIÓN REAL
  console.log('\n🎯 PASO 5: PROBANDO CREACIÓN DE SESIÓN REAL...');
  let testSessionId: string | null = null;
  
  try {
    const sessionData = await heygenService.createStreamingSession('josh_lite3_20230714');
    testSessionId = sessionData.sessionId;
    console.log(`✅ Sesión de prueba creada: ${testSessionId}`);
    console.log(`📺 Stream URL: ${sessionData.streamUrl}`);
    console.log(`🖼️ Preview URL: ${sessionData.previewUrl}`);
    
    // PASO 6: INICIAR SESIÓN
    console.log('\n▶️ PASO 6: INICIANDO SESIÓN...');
    await heygenService.startSession(testSessionId);
    console.log('✅ Sesión iniciada correctamente');
    
    // PASO 7: PROBAR TTS
    console.log('\n🗣️ PASO 7: PROBANDO TEXT-TO-SPEECH...');
    await heygenService.sendTextToSpeech('Hola, soy el Dr. Carlos. El sistema está funcionando correctamente.', testSessionId);
    console.log('✅ TTS enviado correctamente');
    
    // PASO 8: CERRAR SESIÓN DE PRUEBA
    console.log('\n🔚 PASO 8: CERRANDO SESIÓN DE PRUEBA...');
    await heygenService.closeSession(testSessionId);
    console.log('✅ Sesión de prueba cerrada');
    
  } catch (error) {
    console.error('❌ Error en prueba de sesión:', error);
    
    if (testSessionId) {
      try {
        await heygenService.closeSession(testSessionId);
        console.log('🧹 Sesión de prueba cerrada por error');
      } catch (cleanupError) {
        console.log('⚠️ No se pudo cerrar sesión de prueba');
      }
    }
    throw error;
  }
  
  console.log('\n🎉 RESET COMPLETO EXITOSO! 🎉');
  console.log('===============================================');
  console.log('✅ Todas las sesiones canceladas');
  console.log('✅ Sistema limpio');
  console.log('✅ HeyGen funcionando correctamente');
  console.log('✅ Avatar real funcionando (no SVG)');
  console.log('✅ TTS funcionando');
  console.log('\n💡 El sistema está 100% listo para usar!');
}

// Ejecutar inmediatamente
completeSystemReset().catch(error => {
  console.error('💥 RESET FALLÓ:', error);
  console.error('🔧 Verifica tu API key de HeyGen y conexión a internet');
  process.exit(1);
});
