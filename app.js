
const express = require("express");
const app = express();
const cors = require("cors");
const { ORIGIN } = require("./utils/config");
const corsOptions = {
    origin: ORIGIN, // The frontend origin
    credentials: true, // Allow sending credentials (cookies, etc.)
};
app.use(cors(corsOptions));
const { unknownEndpoint, logger, errorHandler } = require("./utils/middleware");
const { scrapeFacebookAds } = require("./services/fbFetcher");
const { classifyBatch } = require("./services/classifier");

app.use(express.json());
app.use(logger);

app.get("/api/v1/search", async (req, res) => {
    try {
        const { search_term, max = 12 } = req.query;
        console.log(search_term + "Length is: ", search_term.length);

        if (!search_term || search_term == "" || search_term == '') return res.status(400).json({ error: "Missing search_term param" });

        console.log(`🔎 Searching for: ${search_term}`);

        // 1. Fetch ads (from scraper, API, or mock)
        const ads = await scrapeFacebookAds(search_term, Number(max), true);

        // 2. Classify & enrich them
        const enrichedAds = await classifyBatch(ads, "mistral:7b-instruct-q4_K_M");
        const mergedResults = enrichedAds.map(classified => {
            const original = ads.find(r => r.libraryId === classified.libraryId);
            return {
                ...original,  // All original properties
                ...classified // Overwrites with LLM additions (category, brand, subCategory)
            };
        });
        res.json({
            search_term,
            count: enrichedAds.length,
            ads: mergedResults
        });
        // res.json({
        //     search_term,
        //     count: ads.length,
        //     ads
        // })
    } catch (err) {
        console.error("❌ Error in /search:", err);
        res.status(500).json({ error: "Internal server error" });
    }
})

app.use(unknownEndpoint);
app.use(errorHandler);
module.exports = app;
