const https = require("https");
const http = require("http");

function extractUrlsFromText(text) {
  const matches = text.match(/https?:\/\/[^\s<>()]+/gi);
  return matches || [];
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

function isShortMarketplaceHost(host) {
  return host === "k.youshop10.com" || host === "m.tb.cn";
}

function isAgentHost(host) {
  const agents = [
    "acbuy.com",
    "bbdbuyeu.com",
    "cnfans.com",
    "hipobuy.com",
    "kakobuy.com",
    "litbuy.com",
    "oopbuy.com",
    "lovegobuy.com",
    "superbuy.com",
    "itaobuy.com",
    "mulebuy.com",
  ];

  return agents.some(
    (agent) => host === agent || host.endsWith(`.${agent}`)
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
      full.match(/itemID=(\d+)/i)?.[1];

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
      full.match(/offer\/(\d+)\.html/i)?.[1];

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

function resolveRedirect(url, maxRedirects = 6) {
  return new Promise((resolve) => {
    const visit = (currentUrl, count) => {
      if (count > maxRedirects) return resolve(currentUrl);

      const parsed = tryParseUrl(currentUrl);

      if (!parsed) return resolve(currentUrl);

      const lib =
        parsed.protocol === "https:" ? https : http;

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

          if (
            location &&
            [301, 302, 303, 307, 308].includes(
              res.statusCode
            )
          ) {
            const nextUrl = new URL(
              location,
              currentUrl
            ).toString();

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

async function convertAnyLinkToBbdbuy(inputUrl) {
  const parsed = tryParseUrl(inputUrl);

  if (!parsed) return null;

  let workingUrl = inputUrl;
  let host = normalizeHost(parsed.hostname);

  if (isShortMarketplaceHost(host)) {
    workingUrl = await resolveRedirect(inputUrl);

    const redirected = tryParseUrl(workingUrl);

    if (!redirected) return null;

    host = normalizeHost(redirected.hostname);
  }

  if (isMarketplaceHost(host)) {
    return normalizeMarketplaceUrl(workingUrl);
  }

  return null;
}

module.exports = {
  extractUrlsFromText,
  convertAnyLinkToBbdbuy,
};