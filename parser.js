const https = require("https");
const http = require("http");

function extractUrlsFromText(text) {
  const matches = text.match(/https?:\/\/[^\s<>()]+/gi);
  return matches || [];
}

function safeDecode(str, rounds = 8) {
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

function isShortMarketplaceHost(host) {
  return host === "k.youshop10.com" || host === "m.tb.cn";
}

function isAgentHost(host) {
  const agents = [
    "cnfans.com",
    "hipobuy.com",
    "kakobuy.com",
    "litbuy.com",
    "oopbuy.com",
    "lovegobuy.com",
    "lovegobuy.net",
    "superbuy.com",
    "itaobuy.com",
    "mulebuy.com",
    "usfans.com",
    "allchinabuy.com",
    "pandabuy.com",
    "joyabuy.com",
    "orientdig.com",
    "ezbuycn.com",
  ];

  return agents.some((agent) => host === agent || host.endsWith(`.${agent}`));
}

function normalizeMarketplaceUrl(urlStr) {
  const url = tryParseUrl(urlStr);
  if (!url) return null;

  const host = normalizeHost(url.hostname);
  const full = safeDecode(urlStr);

  // Weidian / YouShop
  if (host.includes("weidian.com") || host.includes("youshop10.com")) {
    const itemId =
      url.searchParams.get("itemID") ||
      url.searchParams.get("itemId") ||
      url.searchParams.get("id") ||
      full.match(/itemID=(\d+)/i)?.[1] ||
      full.match(/itemId=(\d+)/i)?.[1] ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    if (!itemId) return null;

    return {
      marketplace: "weidian",
      itemId,
      source: "WD",
      originalUrl: `https://weidian.com/item.html?itemID=${itemId}`,
    };
  }

  // Taobao / Tmall
  if (host.includes("taobao.com") || host.includes("tmall.com")) {
    const itemId =
      url.searchParams.get("id") ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    if (!itemId) return null;

    if (host.includes("tmall.com")) {
      return {
        marketplace: "tmall",
        itemId,
        source: "TB",
        originalUrl: `https://detail.tmall.com/item.htm?id=${itemId}`,
      };
    }

    return {
      marketplace: "taobao",
      itemId,
      source: "TB",
      originalUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
    };
  }

  // 1688
  if (host.includes("1688.com")) {
    const itemId =
      full.match(/offer\/(\d+)\.html/i)?.[1] ||
      url.searchParams.get("id") ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    if (!itemId) return null;

    return {
      marketplace: "1688",
      itemId,
      source: "AL",
      originalUrl: `https://detail.1688.com/offer/${itemId}.html`,
    };
  }

  return null;
}

function doubleEncodeUrl(url) {
  return encodeURIComponent(encodeURIComponent(url));
}

function buildAcbuyProductUrl({ originalUrl, itemId, source }) {
  return `https://www.acbuy.com/product?url=${doubleEncodeUrl(originalUrl)}&id=${itemId}&source=${source}`;
}

function resolveRedirect(url, maxRedirects = 6) {
  return new Promise((resolve) => {
    const visit = (currentUrl, count) => {
      if (count > maxRedirects) {
        resolve(currentUrl);
        return;
      }

      const parsed = tryParseUrl(currentUrl);
      if (!parsed) {
        resolve(currentUrl);
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

          res.resume();
          resolve(currentUrl);
        }
      );

      req.on("error", () => resolve(currentUrl));
      req.end();
    };

    visit(url, 0);
  });
}

function extractMarketplaceFromPossibleUrl(value) {
  if (!value) return null;

  const decoded = safeDecode(value, 8);
  const parsed = tryParseUrl(decoded);
  if (!parsed) return null;

  const host = normalizeHost(parsed.hostname);

  if (isMarketplaceHost(host)) {
    return normalizeMarketplaceUrl(decoded);
  }

  return null;
}

function extractNestedMarketplaceUrl(agentUrlStr) {
  const decoded = safeDecode(agentUrlStr, 8);

  // 1) URLs embebidas directas
  const directMatches = decoded.match(/https?:\/\/[^\s<>()]+/gi) || [];
  for (const candidate of directMatches) {
    const info = extractMarketplaceFromPossibleUrl(candidate);
    if (info) return info;
  }

  const agentUrl = tryParseUrl(agentUrlStr);
  if (!agentUrl) return null;

  // 2) Parámetros frecuentes
  const possibleParams = [
    "url",
    "link",
    "target",
    "redirect",
    "redirect_url",
    "goods_url",
    "product_url",
    "origin_url",
    "itemUrl",
    "item_url",
    "share_url",
    "jump_url",
  ];

  for (const key of possibleParams) {
    const value = agentUrl.searchParams.get(key);
    const info = extractMarketplaceFromPossibleUrl(value);
    if (info) return info;
  }

  // 3) Algunos agentes guardan platform + id
  const platform =
    agentUrl.searchParams.get("platform") ||
    agentUrl.searchParams.get("shop_type") ||
    agentUrl.searchParams.get("type") ||
    "";

  const decodedAll = safeDecode(agentUrlStr, 8);

  const itemId =
    agentUrl.searchParams.get("id") ||
    agentUrl.searchParams.get("itemID") ||
    agentUrl.searchParams.get("itemId") ||
    decodedAll.match(/[?&](?:id|itemID|itemId)=(\d+)/i)?.[1];

  if (!itemId) return null;

  const p = platform.toLowerCase();

  if (p.includes("weidian")) {
    return {
      marketplace: "weidian",
      itemId,
      source: "WD",
      originalUrl: `https://weidian.com/item.html?itemID=${itemId}`,
    };
  }

  if (p.includes("taobao")) {
    return {
      marketplace: "taobao",
      itemId,
      source: "TB",
      originalUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
    };
  }

  if (p.includes("tmall")) {
    return {
      marketplace: "tmall",
      itemId,
      source: "TB",
      originalUrl: `https://detail.tmall.com/item.htm?id=${itemId}`,
    };
  }

  if (p.includes("1688") || p.includes("alibaba")) {
    return {
      marketplace: "1688",
      itemId,
      source: "AL",
      originalUrl: `https://detail.1688.com/offer/${itemId}.html`,
    };
  }

  return null;
}

async function convertAnyLinkToAcbuy(inputUrl) {
  const parsed = tryParseUrl(inputUrl);
  if (!parsed) return null;

  let workingUrl = inputUrl;
  let host = normalizeHost(parsed.hostname);

  // Shortlinks
  if (isShortMarketplaceHost(host)) {
    workingUrl = await resolveRedirect(inputUrl);
    const redirected = tryParseUrl(workingUrl);
    if (!redirected) return null;
    host = normalizeHost(redirected.hostname);
  }

  // Marketplace directo
  if (isMarketplaceHost(host)) {
    const info = normalizeMarketplaceUrl(workingUrl);
    if (!info) return null;

    return {
      ...info,
      acbuyUrl: buildAcbuyProductUrl(info),
    };
  }

  // Agente
  if (isAgentHost(host)) {
    const info = extractNestedMarketplaceUrl(workingUrl);
    if (!info) return null;

    return {
      ...info,
      acbuyUrl: buildAcbuyProductUrl(info),
    };
  }

  return null;
}

module.exports = {
  extractUrlsFromText,
  convertAnyLinkToAcbuy,
};