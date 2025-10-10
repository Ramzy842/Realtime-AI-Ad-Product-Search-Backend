// import ollama from "ollama";

function buildPrompt(data) {
    return `Analyze these ads and return ONLY product ads (physical products for sale).
  
  IMPORTANT RULES:
  - Return ONLY ads selling physical products (electronics, clothes, home goods, etc.)
  - EXCLUDE: services, gym memberships, courses, apps, political ads, petitions, events
  - For long text, analyze first 2 sentences - if not product-related, skip the entire element
  - Cross-reference all fields of the analyzed item for more accuracy
  - Return valid JSON array with NO BACKTICKS, NO EXPLANATIONS
  - Deduplicate by libraryId
  
  Data to analyze:
  ${JSON.stringify(data)}
  
  Return format: [{"libraryId": libraryId of the analyzed item,"category":["Electronics"],"brand":["Samsung"],"subCategory": ["Audio"]}]`;
}

async function classifyBatch(data, model) {
    const prompt = buildPrompt(data);
    const { default: ollama } = await import("ollama");
    try {
        const resp = await ollama.chat({
            model: model,
            messages: [{ role: "user", content: prompt }],
            options: {
                temperature: 0.1, // Lower temperature for more consistent classification
            }
        });

        const content = resp.message.content.trim();

        // Try to extract JSON if wrapped in backticks
        let jsonStr = content;
        if (content.startsWith('```')) {
            const match = content.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
            if (match) jsonStr = match[1];
        }

        const parsed = JSON.parse(jsonStr);
        console.log(`✓ LLM classified ${parsed.length} product ads`);
        return parsed;

    } catch (err) {
        console.error("❌ Error classifying batch:", err.message);
        console.log("Raw model output:", resp?.message?.content?.substring(0, 500));
        return [];
    }
}

module.exports = {classifyBatch}