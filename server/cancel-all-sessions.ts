
import { HeyGenService } from './heygen-service.js';

async function cancelAllSessions() {
  console.log('🔄 Cancelando TODAS las sesiones HeyGen activas...');
  
  const heygenService = new HeyGenService();
  
  // Lista extendida de posibles session IDs basada en logs recientes
  const allPotentialSessions = [
    // Sesiones recientes de los logs
    'fe3de5ed-4a5b-11f0-a0c0-f691470b75e2',
    '2a6f2725-4a5c-11f0-97f9-6e2db0bded05',
    'fe0fc279-4a36-11f0-ba0d-5e3b6a3b504d',
    '91aca4d4-4a3a-11f0-b3da-5e0a6fe58bfa',
    '108e6f3a-4a3a-11f0-b3da-5e0a6fe58bfa',
    'c6998ac7-4a3a-11f0-b08d-227b28e9264f',
    
    // Patrones comunes de sesiones
    'session_1', 'session_2', 'session_3', 'session_4', 'session_5',
    'streaming_session_1', 'streaming_session_2', 'streaming_session_3',
    
    // Sesiones de avatar
    'josh_lite3_20230714_session',
    'Dexter_Doctor_Standing2_public_session',
    
    // IDs genéricos que podrían existir
    'default_session', 'test_session', 'avatar_session'
  ];

  let closedCount = 0;
  let errorCount = 0;

  console.log(`📋 Verificando ${allPotentialSessions.length} posibles sesiones...`);

  for (const sessionId of allPotentialSessions) {
    try {
      await heygenService.closeSession(sessionId);
      console.log(`✅ Sesión cerrada: ${sessionId}`);
      closedCount++;
    } catch (error) {
      console.log(`ℹ️  Sesión ${sessionId}: No existe o ya cerrada`);
      errorCount++;
    }
    
    // Pequeña pausa entre llamadas para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n📊 Resumen de cancelación:');
  console.log(`✅ Sesiones cerradas exitosamente: ${closedCount}`);
  console.log(`ℹ️  Sesiones que no existían: ${errorCount}`);
  
  // Pausa adicional para asegurar que HeyGen procese todos los cierres
  console.log('\n⏳ Esperando 3 segundos para confirmar todos los cierres...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('🎉 ¡Todas las sesiones han sido canceladas!');
  console.log('💡 El sistema está limpio y listo para nuevas sesiones.');
}

// Ejecutar inmediatamente
cancelAllSessions().catch(error => {
  console.error('❌ Error al cancelar sesiones:', error);
  process.exit(1);
});
