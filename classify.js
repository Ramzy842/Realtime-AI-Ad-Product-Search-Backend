import ollama from "ollama";
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin())


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

Return format: [{"libraryId": libraryId of the analyzed item,"category":["Electronics"],"brand":"Samsung","subCategory": ["Audio"]}]`;
}

async function classifyBatch(data, model) {
  const prompt = buildPrompt(data);

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
async function demo(data) {

  console.time("GPT-OSS:120B");
  // const labels = await classifyBatch(data, "mistral:7b-instruct-q4_K_M");
  // const labels = await classifyBatch(data, "gpt-oss:20b-cloud");
  // const labels = await classifyBatch(data, "deepseek-v3.1:671b-cloud");
  // const labels = await classifyBatch(data, "gpt-oss:120b-cloud");
  console.timeEnd("GPT-OSS:120B");
  // console.log(labelsDeepseek);
  return labels;
}

async function extractAdData(ad) {
  const getText = async (sel) => {
    const el = await ad.$(sel);
    return el ? (await el.textContent())?.trim() : null;
  };

  const library_id = (await getText('span:has-text("Library ID:")'))
    ?.replace("Library ID:", "")
    ?.trim() || "";

  const status = (await ad.$('span:has-text("Active")')) ? "Active" : "Inactive";
  const page_name = (await getText('a[href*="facebook.com"] span.x8t9es0')) || "";

  // Started running + Active time
  let started_running = "";
  let total_active_time = "";
  const timeText = await getText('span:has-text("Started running")');
  if (timeText && timeText.includes("·")) {
    const parts = timeText.split("·");
    started_running = parts[0].replace("Started running on", "").trim();
    total_active_time = parts[1].replace("Total active time", "").trim();
  }
  else
  {
    started_running = timeText.replace("Started running on", "").trim()
    total_active_time = "More than 24 hrs"
  }

  // Ad text
  const textSelectors = [
    "div._7jyr span",
    'div[class*="_7jyr"] div[style*="white-space"]',
    'div[role="button"] div[class*="_4ik4"]'
  ];
  let ad_text = "";
  for (const sel of textSelectors) {
    const el = await ad.$(sel);
    if (el) {
      const text = await el.textContent();
      if (text && text.length > 20) {
        ad_text = text.trim();
        break;
      }
    }
  }

  // Images
  const imgEls = await ad.$$('img[src*="fbcdn.net"]');
  const images = [];
  for (const img of imgEls) {
    const src = await img.getAttribute("src");
    if (src && src.includes("s600x600")) images.push(src);
  }


  // Videos
  const videoEls = await ad.$$('video[src*="fbcdn.net"]');
  const videos = [];
  for (const vid of videoEls) {
    const src = await vid.getAttribute("src");
    if (src) videos.push(src);
  }

  // Links + CTA
  const link = await ad.$('a[href*="l.facebook.com"]');
  const link_url = link ? await link.getAttribute("href") : null;
  const domainEl = await ad.$('div[class*="x5e6ka"] div[role="button"]');
  const link_domain = domainEl ? await domainEl.textContent() : null;

  const ctaButtons = await ad.$$(
    'div.x8t9es0.x1fvot60.xxio538.x1heor9g.xuxw1ft.x6ikm8r.x10wlt62.xlyipyv.x1h4wwuj.x1pd3egz.xeuugli'
  );
  let cta_button = null;
  for (const button of ctaButtons) {
    cta_button = await button.evaluate(el => el.innerText.trim());
  }

  return {
    libraryId: library_id,
    page_name,
    status,
    started_running,
    total_active_time,
    ad_text,
    images,
    videos,
    link_url,
    link_domain,
    cta_button
  };
}


async function scrapeFacebookAds(url, maxAds, headless) {
  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox"
    ],
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    locale: "en-US"
  });
  const page = await context.newPage();

  console.log('📄 Loading page...');
  await page.goto(url, {
    waitUntil: "networkidle",
  });

  
  await page.getByText("Library ID").all()
  
  console.log('✓ Ads loaded');
  const selectors = [
    '[data-testid="ad-library-ad-carousel-container"]',
    "div.xh8yej3 > div.x1plvlek",
    'div[class*="x1plvlek"][class*="xryxfnj"]',
    "div.xh8yej3 > div"
  ];

  let allAds = [];
  let previousCount = 0;
  let triesWithoutNewAds = 0;

  // Keep scrolling until we reach maxAds or no new ads are loaded
  while (allAds.length < maxAds && triesWithoutNewAds < 5) {
    // Scroll to bottom
    console.log("All ads length: ", allAds.length);
    
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1000);

    // Try all selectors in priority order
    let adContainers = [];
    for (const s of selectors) {
      adContainers = await page.$$(s);
      if (adContainers.length) break;
    }

    // Check progress
    if (adContainers.length > previousCount) {
      previousCount = adContainers.length;
      triesWithoutNewAds = 0;
      console.log(`Loaded ${adContainers.length} ads so far...`);
    } else {
      triesWithoutNewAds++;
      console.log("No new ads loaded, retry:", triesWithoutNewAds);
    }

    allAds = adContainers;
  }

  console.log(`Found ${allAds.length} ads on the page`);

  const ads = [];
  for (const ad of allAds.slice(0, maxAds)) {
    try {
      await ad.scrollIntoViewIfNeeded();
      await ad.waitForSelector('img[src*="fbcdn.net"], video[src*="fbcdn.net"], span:has-text("Library ID:"), div.x8t9es0', { timeout: 5000 }).catch(() => { });

      const data = await extractAdData(ad);
      ads.push(data);
    } catch (err) {
      console.error("Error extracting ad:", err);
    }
  }

  await browser.close();
  return ads;
}





// === Run the scraper ===
(async () => {
  console.time("Process");
  const url =
    `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&q="Electronics"&search_type=keyword_unordered`

  const ads = await scrapeFacebookAds(url, 30, false);

  console.log(`Scraped ${ads.length} ads\n`);
  for (const [i, ad] of ads.entries()) {
    console.log(`\nAD #${i + 1}`);
    console.log("=".repeat(60));
    console.log(ad);
  }

  // Classify with LLM
  // const classificationRes = await demo(ads);
  // console.log('\n=== CLASSIFIED RESULTS ===');
  // console.log(`LLM identified ${classificationRes.length} product ads`);
  // console.log(classificationRes);

  // Merge: Add category, brand, subCategory to original objects
  // const mergedResults = classificationRes.map(classified => {
  //   const original = ads.find(r => r.libraryId === classified.libraryId);
  //   return {
  //     ...original,  // All original properties
  //     ...classified // Overwrites with LLM additions (category, brand, subCategory)
  //   };
  // });

  // console.log('\n=== FINAL MERGED RESULTS ===');
  // console.log(mergedResults);
  console.timeEnd("Process");
})();