
const express = require("express");
const app = express();

const { unknownEndpoint, logger, errorHandler } = require("./utils/middleware");
const { scrapeFacebookAds } = require("./services/fbFetcher");
const { classifyBatch } = require("./services/classifier");

app.use(express.json());
app.use(logger);

app.get("/api/v1/search", async (req, res) => {
    try {
        const { search_term, max = 12 } = req.query;
        if (!search_term || JSON.stringify(search_term.trim()) == "" || JSON.stringify(search_term.trim()) == '') return res.status(400).json({ error: "Missing search_term param" });
        console.log(`🔎 Searching for: ${search_term}`);

        const ads = await scrapeFacebookAds(search_term, Number(max), false);
        
        const enrichedAds = await classifyBatch(ads, "gpt-oss:120b-cloud");
        const mergedResults = enrichedAds.map(classified => {
            const original = ads.find(r => r.libraryId === classified.libraryId);
            return {
                ...original,
                ...classified
            };
        });
        res.json({
            search_term,
            count: enrichedAds.length,
            ads: mergedResults
        });
    } catch (err) {
        console.error("❌ Error in /search:", err);
        res.status(500).json({ error: "Internal server error" });
    }
})

app.use(unknownEndpoint);
app.use(errorHandler);
module.exports = app;
