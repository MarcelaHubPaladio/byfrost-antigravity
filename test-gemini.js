const apiKey = process.env.GEMINI_API_KEY;

async function run() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: "Hello!" }]
      }]
    })
  });
  
  if (!res.ok) {
    console.error("FAILED:", await res.text());
  } else {
    console.log("SUCCESS:", await res.json());
  }
}

run();
