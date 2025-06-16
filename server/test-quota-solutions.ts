
import fetch from 'node-fetch';

async function testQuotaSolutions() {
  console.log('🔧 Testing different configurations to solve quota issue...');
  
  const apiKey = process.env.HEYGEN_API_KEY;
  
  // Configuration options to try
  const configs = [
    {
      name: 'Ultra Low Quality',
      body: {
        quality: 'low',
        avatar_name: 'josh_lite3_20230714'
      }
    },
    {
      name: 'Basic Free Avatar',
      body: {
        quality: 'medium',
        avatar_name: 'Dexter_Doctor_Standing2_public'
      }
    },
    {
      name: 'Minimal Config',
      body: {
        avatar_name: 'josh_lite3_20230714'
      }
    },
    {
      name: 'With Voice Config',
      body: {
        quality: 'low',
        avatar_name: 'josh_lite3_20230714',
        voice: {
          voice_id: '08284d3fc63a424fbe80cc1864ed2540'
        }
      }
    }
  ];
  
  for (const config of configs) {
    console.log(`\n🧪 Testing: ${config.name}`);
    
    try {
      const response = await fetch('https://api.heygen.com/v1/streaming.new', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config.body)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${config.name} SUCCESS!`);
        console.log('Session data:', JSON.stringify(data, null, 2));
        
        // Close the session immediately
        if (data.data?.session_id) {
          await fetch('https://api.heygen.com/v1/streaming.stop', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              session_id: data.data.session_id
            })
          });
          console.log('Session closed');
        }
        
        console.log('🎉 FOUND WORKING CONFIGURATION!');
        break;
      } else {
        const errorText = await response.text();
        console.log(`❌ ${config.name} failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.log(`❌ ${config.name} error:`, error);
    }
    
    // Wait between attempts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🔍 All configurations tested');
}

testQuotaSolutions();
