const apiKey = process.env.GEMINI_API_KEY;

async function testModel(model) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: "Hello, reply with just 'ok'" }]
      }]
    })
  });
  
  if (!res.ok) {
    console.error(`[${model}] FAILED:`, await res.text());
  } else {
    console.log(`[${model}] SUCCESS`);
  }
}

async function run() {
  await testModel("gemini-pro-latest");
  await testModel("gemini-2.5-pro");
  await testModel("gemini-3.5-flash");
}

run();
