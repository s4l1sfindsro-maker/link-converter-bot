const https = require("https");
const http = require("http");

function extractUrlsFromText(text) {
  return text.match(/https?:\/\/[^\s<>()]+/gi) || [];
}

function buildBbdbuyUrl(platform, itemId) {
  const normalized = platform.toUpperCase();
  return `https://www.bbdbuyeu.com/goods/${normalized}/${itemId}`;
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

function buildInfo(platform, itemId) {
  if (!platform || !itemId) return null;

  const p = String(platform).toLowerCase();

  if (p.includes("weidian") || p === "wd" || p === "3") {
    return {
      marketplace: "WEIDIAN",
      itemId,
      originalUrl: `https://weidian.com/item.html?itemID=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("WEIDIAN", itemId),
    };
  }

  if (p.includes("1688") || p.includes("alibaba") || p === "al" || p === "ali" || p === "1") {
    return {
      marketplace: "1688",
      itemId,
      originalUrl: `https://detail.1688.com/offer/${itemId}.html`,
      bbdbuyUrl: buildBbdbuyUrl("1688", itemId),
    };
  }

  if (p.includes("taobao") || p.includes("tmall") || p === "tb" || p === "2") {
    return {
      marketplace: "TAOBAO",
      itemId,
      originalUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
      bbdbuyUrl: buildBbdbuyUrl("TAOBAO", itemId),
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

    return buildInfo("WEIDIAN", itemId);
  }

  if (host.includes("1688.com")) {
    const itemId =
      full.match(/offer\/(\d+)\.html/i)?.[1] ||
      url.searchParams.get("id") ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    return buildInfo("1688", itemId);
  }

  if (host.includes("taobao.com") || host.includes("tmall.com")) {
    const itemId =
      url.searchParams.get("id") ||
      full.match(/[?&]id=(\d+)/i)?.[1];

    return buildInfo("TAOBAO", itemId);
  }

  return null;
}

function extractFromAcbuy(urlStr) {
  const url = tryParseUrl(urlStr);
  if (!url) return null;

  const host = normalizeHost(url.hostname);
  if (!host.includes("acbuy.com")) return null;

  const urlParam = url.searchParams.get("url");
  if (urlParam) {
    const decodedOriginal = safeDecode(urlParam, 10);
    const info = normalizeMarketplaceUrl(decodedOriginal);
    if (info) return info;
  }

  const itemId = url.searchParams.get("id");
  const source = url.searchParams.get("source");

  if (!itemId || !source) return null;

  const src = source.toUpperCase();

  if (src === "WD" || src === "WEIDIAN") return buildInfo("WEIDIAN", itemId);
  if (src === "AL" || src === "ALI" || src === "1688") return buildInfo("1688", itemId);
  if (src === "TB" || src === "TAOBAO" || src === "TMALL") return buildInfo("TAOBAO", itemId);

  return null;
}

function extractFromKnownAgent(urlStr) {
  const url = tryParseUrl(urlStr);
  if (!url) return null;

  const host = normalizeHost(url.hostname);
  const full = safeDecode(urlStr, 10);

  const acbuyInfo = extractFromAcbuy(full);
  if (acbuyInfo) return acbuyInfo;

  const marketInfo = normalizeMarketplaceUrl(full);
  if (marketInfo) return marketInfo;

  const possibleParams = [
    "url",
    "keyword",
    "originKeywordUrl",
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
    const value = url.searchParams.get(key);
    if (!value) continue;

    const decodedValue = safeDecode(value, 10);

    const acbuyFromParam = extractFromAcbuy(decodedValue);
    if (acbuyFromParam) return acbuyFromParam;

    const marketFromParam = normalizeMarketplaceUrl(decodedValue);
    if (marketFromParam) return marketFromParam;
  }

  let match = full.match(/\/product\/(weidian|1688|taobao|tmall|alibaba)\/(\d+)/i);
  if (match) return buildInfo(match[1], match[2]);

  match = full.match(/\/product\/(\d+)\/(\d+)/i);
  if (match) {
    const code = match[1];
    const itemId = match[2];

   if (host.includes("vigorbuy.com") || host.includes("vigorbuy.cc")) {
      if (code === "0") return buildInfo("1688", itemId);
      if (code === "1") return buildInfo("TAOBAO", itemId);
      if (code === "2") return buildInfo("WEIDIAN", itemId);
      if (code === "3") return buildInfo("TAOBAO", itemId);
}

    if (host.includes("litbuy.com")) {
      if (code === "1") return buildInfo("1688", itemId);
      if (code === "2") return buildInfo("TAOBAO", itemId);
      if (code === "3") return buildInfo("WEIDIAN", itemId);
    }
  }

  const goodsId =
    url.searchParams.get("goodsId") ||
    url.searchParams.get("goods_id") ||
    url.searchParams.get("id") ||
    url.searchParams.get("itemID") ||
    url.searchParams.get("itemId");

  const source =
    url.searchParams.get("source") ||
    url.searchParams.get("platform") ||
    url.searchParams.get("shop_type") ||
    url.searchParams.get("type") ||
    url.searchParams.get("channel");

  if (goodsId && source) {
    const s = source.toLowerCase();

    if (host.includes("rizzitgo.com") || host.includes("rizitgo.com")) {
      if (s === "3") return buildInfo("WEIDIAN", goodsId);
      if (s === "1") return buildInfo("1688", goodsId);
      if (s === "2") return buildInfo("TAOBAO", goodsId);
    }

    return buildInfo(source, goodsId);
  }

  const itemId =
    url.searchParams.get("id") ||
    url.searchParams.get("itemID") ||
    url.searchParams.get("itemId") ||
    full.match(/[?&](?:id|itemID|itemId|goodsId)=(\d+)/i)?.[1];

  const platform =
    url.searchParams.get("platform") ||
    url.searchParams.get("shop_type") ||
    url.searchParams.get("type") ||
    url.searchParams.get("channel") ||
    "";

  if (itemId && platform) return buildInfo(platform, itemId);

  return null;
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
    "vigorbuy.com",
    "vigorbuy.cc",
    "gtbuy.com",
    "rizzitgo.com",
    "rizitgo.com",
  ];

  return agents.some((agent) => host === agent || host.endsWith(`.${agent}`));
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
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
            if (body.length > 500000) res.destroy();
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

function extractFromText(text) {
  const decoded = safeDecode(text, 10);

  const direct = extractFromKnownAgent(decoded) || normalizeMarketplaceUrl(decoded);
  if (direct) return direct;

  const urls = decoded.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];

  for (const candidate of urls) {
    const clean = safeDecode(candidate, 10);

    const info =
      extractFromKnownAgent(clean) ||
      normalizeMarketplaceUrl(clean) ||
      extractFromAcbuy(clean);

    if (info) return info;
  }

  const encodedUrl =
    decoded.match(/https%3A%2F%2F[^"'<>\\\s]+/i)?.[0] ||
    decoded.match(/https%253A%252F%252F[^"'<>\\\s]+/i)?.[0];

  if (encodedUrl) {
    const info = normalizeMarketplaceUrl(safeDecode(encodedUrl, 10));
    if (info) return info;
  }

  return null;
}

async function convertAnyLinkToBbdbuy(inputUrl) {
  const parsed = tryParseUrl(inputUrl);
  if (!parsed) return null;

  const host = normalizeHost(parsed.hostname);

  const direct =
    extractFromKnownAgent(inputUrl) ||
    normalizeMarketplaceUrl(inputUrl) ||
    extractFromAcbuy(inputUrl);

  if (direct) return direct;

  if (
    isAgentHost(host) ||
    host.includes("youshop10.com") ||
    host.includes("m.tb.cn")
  ) {
    const fetched = await requestUrl(inputUrl);

    const fromFinal = extractFromText(fetched.finalUrl);
    if (fromFinal) return fromFinal;

    const fromBody = extractFromText(fetched.body);
    if (fromBody) return fromBody;
  }

  return null;
}

module.exports = {
  extractUrlsFromText,
  convertAnyLinkToBbdbuy,
};
