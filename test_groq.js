const fs = require('fs');

async function test() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const groqKey = envFile.split('\n').find(l => l.startsWith('GROQ_API_KEY=')).split('=')[1].trim();
  const prompt = `
    Analiza este mensaje del usuario (Rol: cliente), basándote en el historial reciente para entender el contexto.
    
    --- Historial Reciente ---
    Sin contexto previo.
    --------------------------

    Clasifica el ÚLTIMO MENSAJE estrictamente en UNA de estas acciones permitidas:
    - consultar_mis_favoritos
    - respuesta_general
    
    Mensaje actual: "hola tengo favoritos?"

    Responde ÚNICAMENTE con este JSON válido:
    {
      "action": "..."
    }
  `;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
    body: JSON.stringify({ 
      model: 'llama-3.3-70b-versatile', 
      messages: [{ role: 'user', content: prompt }], 
      temperature: 0.1, 
      response_format: { type: 'json_object' } 
    })
  });
  const data = await res.json();
  console.log('GROQ CLASSIFICATION:', data.choices[0].message.content);
}

test().catch(console.error);
