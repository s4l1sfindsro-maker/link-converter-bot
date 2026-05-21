const https = require("https");
const http = require("http");

function extractUrlsFromText(text) {
  return text.match(/https?:\/\/[^\s<>()]+/gi) || [];
}

function buildBbdbuyUrl(platform, itemId) {
  return `https://www.bbdbuyeu.com/goods/${platform}/${itemId}`;
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
    "ezbuycn.com"
  ];

  return agents.some(agent => host === agent || host.endsWith(`.${agent}`));
}

function isShortLink(host) {
  return (
    host === "k.youshop10.com" ||
    host === "m.tb.cn" ||
    host.includes("litbuy.shop")
  );
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

    if (!itemId) return null;

    return {
      marketplace: "weidian",
      itemId,
      originalUrl: `https://weidian.com/item.html?itemID=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("weidian", itemId),
    };
  }

  if (host.includes("taobao.com") || host.includes("tmall.com")) {
    const itemId =
      url.searchParams.get("id") ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    if (!itemId) return null;

    return {
      marketplace: "taobao",
      itemId,
      originalUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("taobao", itemId),
    };
  }

  if (host.includes("1688.com")) {
    const itemId =
      full.match(/offer\/(\d+)\.html/i)?.[1] ||
      url.searchParams.get("id") ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    if (!itemId) return null;

    return {
      marketplace: "1688",
      itemId,
      originalUrl: `https://detail.1688.com/offer/${itemId}.html`,
      bbdbuyUrl: buildBbdbuyUrl("1688", itemId),
    };
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
    return {
      marketplace: "1688",
      itemId,
      originalUrl: `https://detail.1688.com/offer/${itemId}.html`,
      bbdbuyUrl: buildBbdbuyUrl("1688", itemId),
    };
  }

  if (src === "WD" || src === "WEIDIAN") {
    return {
      marketplace: "weidian",
      itemId,
      originalUrl: `https://weidian.com/item.html?itemID=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("weidian", itemId),
    };
  }

  if (src === "TB" || src === "TAOBAO" || src === "TMALL") {
    return {
      marketplace: "taobao",
      itemId,
      originalUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("taobao", itemId),
    };
  }

  return null;
}

function resolveRedirect(url, maxRedirects = 8) {
  return new Promise((resolve) => {
    const visit = (currentUrl, count) => {
      if (count > maxRedirects) return resolve(currentUrl);

      const parsed = tryParseUrl(currentUrl);
      if (!parsed) return resolve(currentUrl);

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

function extractNestedMarketplace(agentUrlStr) {
  const acbuyInfo = extractFromAcbuy(agentUrlStr);
  if (acbuyInfo) return acbuyInfo;

  const decoded = safeDecode(agentUrlStr, 10);

  const urls = decoded.match(/https?:\/\/[^\s<>()]+/gi) || [];
  for (const candidate of urls) {
    const parsed = tryParseUrl(candidate);
    if (!parsed) continue;

    const host = normalizeHost(parsed.hostname);
    if (isMarketplaceHost(host)) {
      const info = normalizeMarketplaceUrl(candidate);
      if (info) return info;
    }
  }

  const agentUrl = tryParseUrl(agentUrlStr);
  if (!agentUrl) return null;

  const params = [
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
    "jump_url"
  ];

  for (const key of params) {
    const value = agentUrl.searchParams.get(key);
    if (!value) continue;

    const decodedValue = safeDecode(value, 10);
    const info = normalizeMarketplaceUrl(decodedValue);
    if (info) return info;
  }

  const platform =
    agentUrl.searchParams.get("platform") ||
    agentUrl.searchParams.get("shop_type") ||
    agentUrl.searchParams.get("type") ||
    "";

  const itemId =
    agentUrl.searchParams.get("id") ||
    agentUrl.searchParams.get("itemID") ||
    agentUrl.searchParams.get("itemId") ||
    decoded.match(/[?&](?:id|itemID|itemId)=(\d+)/i)?.[1];

  if (!itemId) return null;

  const p = platform.toLowerCase();

  if (p.includes("weidian")) {
    return {
      marketplace: "weidian",
      itemId,
      originalUrl: `https://weidian.com/item.html?itemID=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("weidian", itemId),
    };
  }

  if (p.includes("taobao") || p.includes("tmall")) {
    return {
      marketplace: "taobao",
      itemId,
      originalUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("taobao", itemId),
    };
  }

  if (p.includes("1688") || p.includes("alibaba")) {
    return {
      marketplace: "1688",
      itemId,
      originalUrl: `https://detail.1688.com/offer/${itemId}.html`,
      bbdbuyUrl: buildBbdbuyUrl("1688", itemId),
    };
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

  if (isShortLink(host)) {
    workingUrl = await resolveRedirect(inputUrl);
    const redirected = tryParseUrl(workingUrl);
    if (redirected) host = normalizeHost(redirected.hostname);
  }

  if (isMarketplaceHost(host)) {
    return normalizeMarketplaceUrl(workingUrl);
  }

  if (isAgentHost(host)) {
    const info = extractNestedMarketplace(workingUrl);
    if (info) return info;
  }

  return null;
}

module.exports = {
  extractUrlsFromText,
  convertAnyLinkToBbdbuy,
};
