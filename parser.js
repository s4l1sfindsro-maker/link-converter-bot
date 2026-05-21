const https = require("https");
const http = require("http");

function extractUrlsFromText(text) {
  return text.match(/https?:\/\/[^\s<>()]+/gi) || [];
}

function buildBbdbuyUrl(platform, itemId) {
  return `https://www.bbdbuyeu.com/goods/${platform}/${itemId}`;
}

function safeDecode(str, rounds = 10) {
  let current = str;

  for (let i = 0; i < rounds; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeHost(host) {
  return host.replace(/^www\./i, "").toLowerCase();
}

function isMarketplaceHost(host) {
  return (
    host.includes("weidian.com") ||
    host.includes("youshop10.com") ||
    host.includes("taobao.com") ||
    host.includes("tmall.com") ||
    host.includes("1688.com")
  );
}

function isAgentHost(host) {
  const agents = [
    "acbuy.com",
    "kakobuy.com",
    "hipobuy.com",
    "litbuy.com",
    "litbuy.shop",
    "cnfans.com",
    "oopbuy.com",
    "lovegobuy.com",
    "superbuy.com",
    "itaobuy.com",
    "mulebuy.com",
    "usfans.com",
    "allchinabuy.com",
    "joyabuy.com",
    "orientdig.com",
    "ezbuycn.com",
  ];

  return agents.some((agent) => host === agent || host.endsWith(`.${agent}`));
}

function isShortLink(host) {
  return (
    host === "k.youshop10.com" ||
    host === "m.tb.cn" ||
    host.includes("litbuy.shop")
  );
}

function buildInfo(platform, itemId) {
  if (!itemId) return null;

  if (platform === "1688") {
    return {
      marketplace: "1688",
      itemId,
      originalUrl: `https://detail.1688.com/offer/${itemId}.html`,
      bbdbuyUrl: buildBbdbuyUrl("1688", itemId),
    };
  }

  if (platform === "weidian") {
    return {
      marketplace: "weidian",
      itemId,
      originalUrl: `https://weidian.com/item.html?itemID=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("weidian", itemId),
    };
  }

  if (platform === "taobao") {
    return {
      marketplace: "taobao",
      itemId,
      originalUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("taobao", itemId),
    };
  }

  return null;
}

function normalizeMarketplaceUrl(urlStr) {
  const url = tryParseUrl(urlStr);
  if (!url) return null;

  const host = normalizeHost(url.hostname);
  const full = safeDecode(urlStr);

  if (host.includes("weidian.com") || host.includes("youshop10.com")) {
    const itemId =
      url.searchParams.get("itemID") ||
      url.searchParams.get("itemId") ||
      url.searchParams.get("id") ||
      full.match(/itemID=(\d+)/i)?.[1] ||
      full.match(/itemId=(\d+)/i)?.[1] ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    return buildInfo("weidian", itemId);
  }

  if (host.includes("taobao.com") || host.includes("tmall.com")) {
    const itemId =
      url.searchParams.get("id") ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    return buildInfo("taobao", itemId);
  }

  if (host.includes("1688.com")) {
    const itemId =
      full.match(/offer\/(\d+)\.html/i)?.[1] ||
      url.searchParams.get("id") ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    return buildInfo("1688", itemId);
  }

  return null;
}

function extractFromAcbuy(urlStr) {
  const url = tryParseUrl(urlStr);
  if (!url) return null;

  const host = normalizeHost(url.hostname);
  if (!host.includes("acbuy.com")) return null;

  const itemId = url.searchParams.get("id");
  const source = url.searchParams.get("source");

  if (!itemId || !source) return null;

  const src = source.toUpperCase();

  if (src === "AL" || src === "ALI" || src === "1688") {
    return buildInfo("1688", itemId);
  }

  if (src === "WD" || src === "WEIDIAN") {
    return buildInfo("weidian", itemId);
  }

  if (src === "TB" || src === "TAOBAO" || src === "TMALL") {
    return buildInfo("taobao", itemId);
  }

  return null;
}

function extractFromLitbuy(urlStr) {
  const url = tryParseUrl(urlStr);
  if (!url) return null;

  const host = normalizeHost(url.hostname);
  const full = safeDecode(urlStr);

  if (!host.includes("litbuy.com")) return null;

  const match = full.match(/\/product\/(\d+)\/(\d+)/i);
  if (!match) return null;

  const platformCode = match[1];
  const itemId = match[2];

  if (platformCode === "1") return buildInfo("1688", itemId);
  if (platformCode === "2") return buildInfo("taobao", itemId);
  if (platformCode === "3") return buildInfo("weidian", itemId);

  return buildInfo("1688", itemId);
}

function requestUrl(url, maxRedirects = 8) {
  return new Promise((resolve) => {
    const visit = (currentUrl, count) => {
      if (count > maxRedirects) {
        resolve({ finalUrl: currentUrl, body: "" });
        return;
      }

      const parsed = tryParseUrl(currentUrl);
      if (!parsed) {
        resolve({ finalUrl: currentUrl, body: "" });
        return;
      }

      const lib = parsed.protocol === "https:" ? https : http;

      const req = lib.request(
        currentUrl,
        {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        },
        (res) => {
          const location = res.headers.location;

          if (location && [301, 302, 303, 307, 308].includes(res.statusCode)) {
            const nextUrl = new URL(location, currentUrl).toString();
            res.resume();
            visit(nextUrl, count + 1);
            return;
          }

          let body = "";
          res.setEncoding("utf8");

          res.on("data", (chunk) => {
            body += chunk;
            if (body.length > 300000) {
              res.destroy();
            }
          });

          res.on("end", () => {
            resolve({ finalUrl: currentUrl, body });
          });
        }
      );

      req.on("error", () => resolve({ finalUrl: currentUrl, body: "" }));
      req.end();
    };

    visit(url, 0);
  });
}

function extractNestedMarketplace(text) {
  const decoded = safeDecode(text, 10);

  const acbuyInfo = extractFromAcbuy(decoded);
  if (acbuyInfo) return acbuyInfo;

  const litbuyInfo = extractFromLitbuy(decoded);
  if (litbuyInfo) return litbuyInfo;

  const urls = decoded.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];

  for (const candidate of urls) {
    const clean = safeDecode(candidate, 10);
    const parsed = tryParseUrl(clean);
    if (!parsed) continue;

    const host = normalizeHost(parsed.hostname);

    if (isMarketplaceHost(host)) {
      const info = normalizeMarketplaceUrl(clean);
      if (info) return info;
    }

    if (host.includes("acbuy.com")) {
      const info = extractFromAcbuy(clean);
      if (info) return info;
    }

    if (host.includes("litbuy.com")) {
      const info = extractFromLitbuy(clean);
      if (info) return info;
    }
  }

  const itemId =
    decoded.match(/itemID[=:]"?(\d+)/i)?.[1] ||
    decoded.match(/itemId[=:]"?(\d+)/i)?.[1] ||
    decoded.match(/["'?&](?:id|goodsId|item_id|itemId|itemID)[=:]"?(\d{6,})/i)?.[1];

  const platformMatch =
    decoded.match(/platform[=:]"?([a-zA-Z0-9_]+)/i)?.[1] ||
    decoded.match(/shop_type[=:]"?([a-zA-Z0-9_]+)/i)?.[1] ||
    decoded.match(/source[=:]"?([a-zA-Z0-9_]+)/i)?.[1] ||
    "";

  if (!itemId) return null;

  const p = platformMatch.toLowerCase();

  if (p.includes("1688") || p.includes("alibaba") || p === "al" || p === "ali") {
    return buildInfo("1688", itemId);
  }

  if (p.includes("weidian") || p === "wd") {
    return buildInfo("weidian", itemId);
  }

  if (p.includes("taobao") || p.includes("tmall") || p === "tb") {
    return buildInfo("taobao", itemId);
  }

  return null;
}

async function convertAnyLinkToBbdbuy(inputUrl) {
  const parsed = tryParseUrl(inputUrl);
  if (!parsed) return null;

  let workingUrl = inputUrl;
  let host = normalizeHost(parsed.hostname);

  const acbuyInfo = extractFromAcbuy(inputUrl);
  if (acbuyInfo) return acbuyInfo;

  const litbuyInfo = extractFromLitbuy(inputUrl);
  if (litbuyInfo) return litbuyInfo;

  if (isShortLink(host)) {
    const resolved = await requestUrl(inputUrl);
    workingUrl = resolved.finalUrl;

    const redirected = tryParseUrl(workingUrl);
    if (redirected) host = normalizeHost(redirected.hostname);

    const fromFinal = normalizeMarketplaceUrl(workingUrl);
    if (fromFinal) return fromFinal;

    const fromBody = extractNestedMarketplace(resolved.body);
    if (fromBody) return fromBody;
  }

  if (isMarketplaceHost(host)) {
    return normalizeMarketplaceUrl(workingUrl);
  }

  if (isAgentHost(host)) {
    const fromUrl = extractNestedMarketplace(workingUrl);
    if (fromUrl) return fromUrl;

    const fetched = await requestUrl(workingUrl);

    const fromFinal = extractNestedMarketplace(fetched.finalUrl);
    if (fromFinal) return fromFinal;

    const fromBody = extractNestedMarketplace(fetched.body);
    if (fromBody) return fromBody;
  }

  return null;
}

module.exports = {
  extractUrlsFromText,
  convertAnyLinkToBbdbuy,
};
