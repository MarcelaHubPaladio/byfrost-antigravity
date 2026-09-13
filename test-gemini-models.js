const apiKey = process.env.GEMINI_API_KEY;

async function run() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  
  if (!res.ok) {
    console.error("FAILED:", await res.text());
  } else {
    const data = await res.json();
    console.log("MODELS:", data.models.map(m => m.name).join(', '));
  }
}

run();
