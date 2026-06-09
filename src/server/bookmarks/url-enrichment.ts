import { mkdir, writeFile, access } from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { faviconCache } from "@/lib/db/schema";

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const domainRateLimit = new Map<string, number>();
const RATE_LIMIT_MS = 2000;

export type EnrichmentResult = {
  title: string | null;
  description: string | null;
  faviconPath: string | null;
  autoTitle: string | null;
  autoDescription: string | null;
};

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host.startsWith("127.")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  const match = /^172\.(\d+)\./.exec(host);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function normalizeUrl(raw: string): URL {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withProtocol);
}

async function fetchWithTimeout(url: string, redirectCount = 0): Promise<Response> {
  if (redirectCount > 1) throw new Error("Too many redirects");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NexusBookmarkEnricher/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      const next = new URL(location, url).toString();
      return fetchWithTimeout(next, redirectCount + 1);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

function extractMetadata(html: string, pageUrl: URL) {
  const $ = cheerio.load(html.slice(0, MAX_HTML_BYTES));
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    null;
  const description =
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $('meta[name="description"]').attr("content")?.trim() ||
    null;

  const iconHref =
    $('link[rel="apple-touch-icon"]').attr("href") ||
    $('link[rel="icon"][sizes="32x32"]').attr("href") ||
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    null;

  let faviconUrl: string | null = null;
  if (iconHref) {
    try {
      faviconUrl = new URL(iconHref, pageUrl).toString();
    } catch {
      faviconUrl = null;
    }
  } else {
    faviconUrl = new URL("/favicon.ico", pageUrl).toString();
  }

  return { title, description, faviconUrl };
}

async function getUploadDir() {
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  await mkdir(uploadDir, { recursive: true });
  await mkdir(path.join(uploadDir, "favicons"), { recursive: true });
  return uploadDir;
}

async function cacheFavicon(domain: string, faviconUrl: string): Promise<string | null> {
  const [cached] = await db
    .select()
    .from(faviconCache)
    .where(eq(faviconCache.domain, domain))
    .limit(1);

  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.faviconPath;
  }

  const lastFetch = domainRateLimit.get(domain) ?? 0;
  if (Date.now() - lastFetch < RATE_LIMIT_MS) {
    return cached?.faviconPath ?? null;
  }
  domainRateLimit.set(domain, Date.now());

  try {
    const response = await fetchWithTimeout(faviconUrl);
    if (!response.ok) return cached?.faviconPath ?? null;

    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) return cached?.faviconPath ?? null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 256_000) return cached?.faviconPath ?? null;

    const ext = contentType.includes("svg")
      ? ".svg"
      : contentType.includes("jpeg")
        ? ".jpg"
        : contentType.includes("gif")
          ? ".gif"
          : ".png";
    const filename = `favicons/${domain.replace(/[^a-z0-9.-]/gi, "_")}${ext}`;
    const uploadDir = await getUploadDir();
    const fullPath = path.join(uploadDir, filename);

    await writeFile(fullPath, buffer);

    await db
      .insert(faviconCache)
      .values({ domain, faviconPath: filename, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: faviconCache.domain,
        set: { faviconPath: filename, fetchedAt: new Date() },
      });

    return filename;
  } catch {
    return cached?.faviconPath ?? null;
  }
}

export async function enrichUrl(rawUrl: string): Promise<EnrichmentResult> {
  let pageUrl: URL;
  try {
    pageUrl = normalizeUrl(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(pageUrl.protocol)) {
    throw new Error("Only HTTP(S) URLs are supported");
  }

  if (isPrivateHost(pageUrl.hostname)) {
    throw new Error("Internal or private URLs cannot be enriched externally");
  }

  const response = await fetchWithTimeout(pageUrl.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch page (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("URL did not return HTML content");
  }

  const html = await response.text();
  const { title, description, faviconUrl } = extractMetadata(html, pageUrl);
  let faviconPath: string | null = null;

  if (faviconUrl) {
    faviconPath = await cacheFavicon(pageUrl.hostname, faviconUrl);
  }

  return {
    title,
    description,
    faviconPath,
    autoTitle: title,
    autoDescription: description,
  };
}

export async function faviconFileExists(relativePath: string) {
  try {
    const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
    await access(path.join(uploadDir, relativePath));
    return true;
  } catch {
    return false;
  }
}
