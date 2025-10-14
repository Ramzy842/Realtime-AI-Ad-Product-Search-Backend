const { chromium } = require("playwright-extra")
const StealthPlugin = require("puppeteer-extra-plugin-stealth")

chromium.use(StealthPlugin())

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
    else {
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
        cta_button,
    };
}

async function scrapeFacebookAds(search_term, maxAds, headless) {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&q=${search_term}&search_type=keyword_unordered`
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
    const skipped = [];
    // let adNum = 0;
    for (const ad of allAds.slice(0, maxAds)) {
        try {
            await ad.scrollIntoViewIfNeeded();
            await ad.waitForSelector('img[src*="fbcdn.net"], video[src*="fbcdn.net"], span:has-text("Library ID:"), div.x8t9es0').catch(() => { });

            const data = await extractAdData(ad);
            // data.ad_number = ++adNum;
            len = data.ad_text.length
            if (len < 2000)
                ads.push(data);
            else
                skipped.push({
                    libraryId: data.libraryId,
                    page_name: data.page_name,
                    reason: "too long",
                    len,
                });
        } catch (err) {
            console.error("Error extracting ad:", err);
        }
    }

    await browser.close();
    console.log(`✅ Kept ${ads.length} ads | 🪶 Skipped ${skipped.length} (too long)`);
    console.log("✅ Kept: ", (ads));
    console.log("🪶 Skipped: ", (skipped));
    return ads;
}

module.exports = { scrapeFacebookAds }