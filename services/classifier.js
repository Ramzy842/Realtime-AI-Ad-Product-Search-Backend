function buildPrompt(data) {
    return `
    - I will provide you with an array of ads objects. Each object looks like this:
    {
        libraryId,
        page_name,
        status,
        started_running,
        total_active_time,
        ad_text,
        images,
        videos,
        link_url,
        link_domain,
        cta_button,
    }
    Your job is to analyze these ads and return ONLY product ads (physical products for sale).
  
    IMPORTANT RULES:
    - Return ONLY ads selling physical products (electronics, clothes, home goods, etc.)
    - EXCLUDE: services, gym memberships, courses, apps, political ads, petitions, events
    - Analyze and cross-reference only the following fields in each ad object to give accurate results:
        - page_name
        - ad_text
        - link_domain
        - cta_button
    - For long text, analyze first 2 sentences - if not product-related, skip the entire ad object.
    - You also have a task of identifying what each product's ad:
        -   Brand: brand/brands advertised in the ad.
        -   Category: category/categories the product in the ad belongs to.
        -   Subcategory: Subcategory/Subcateogries the product in the ad belongs to.
    - Return valid JSON array with ONLY product ads. NO BACKTICKS, NO EXPLANATIONS.
    - In case you identified no product ads, Return one valid empty JSON array as the result.
    
    OUTPUT EXAMPLES:
    - [{"libraryId": libraryId of the analyzed ad object,"category":["Electronics"],"brand":["Samsung"],"subCategory": ["Audio"]}]
    - [{"libraryId": libraryId of the analyzed ad object,"category":["Fitness"],"brand":["Nike"],"subCategory": ["Shoes"]}]
    - [{"libraryId": libraryId of the analyzed ad object,"category":["Fitness", "Clothing"],"brand":["Nike", "Adidas"],"subCategory": ["Apparel", "Shoes"]}]
    Here's the data to analyze: ${JSON.stringify(data)}`
}

async function classifyBatch(data, model) {
    const prompt = buildPrompt(data);
    const { default: ollama } = await import("ollama");
    try {
        const resp = await ollama.chat({
            model: model,
            messages: [{ role: "user", content: prompt }],
        });

        const content = resp.message.content.trim();
        console.log("content: ", content);

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

module.exports = { classifyBatch }