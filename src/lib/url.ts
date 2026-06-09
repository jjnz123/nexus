import { headers } from "next/headers";

type HeaderSource = {
  get(name: string): string | null;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function parseHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

/** True for RFC1918, loopback, and link-local hosts. */
function isPrivateHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.startsWith("127.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

/**
 * Canonical public app URL from environment (emails, background jobs without request context).
 * Prefer NEXT_PUBLIC_APP_URL, then AUTH_URL.
 */
export function getAppUrlFromEnv(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:8374";
  return stripTrailingSlash(url);
}

/**
 * Resolve the request origin for redirects and auth callbacks.
 * Prefer Cloudflare Tunnel / reverse-proxy forwarded headers, then a public env URL
 * when the request origin is an internal address.
 */
export function getRequestOrigin(headers: HeaderSource, fallbackOrigin?: string): string {
  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedProto = headers.get("x-forwarded-proto");

  // Cloudflare Tunnel and other reverse proxies set these headers.
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0]?.trim();
    const proto = forwardedProto?.split(",")[0]?.trim() || "https";
    if (host) return `${proto}://${host}`;
  }

  const envUrl = getAppUrlFromEnv();
  const envHost = parseHostname(envUrl);

  if (fallbackOrigin) {
    const fallbackHost = parseHostname(fallbackOrigin);
    if (
      fallbackHost &&
      isPrivateHost(fallbackHost) &&
      envHost &&
      !isPrivateHost(envHost)
    ) {
      return envUrl;
    }
    return stripTrailingSlash(fallbackOrigin);
  }

  return envUrl;
}

/** Build an absolute URL for a path using request headers (middleware, route handlers). */
export function absoluteUrlFromRequest(
  path: string,
  request: { headers: HeaderSource; nextUrl: { origin: string } }
): URL {
  const origin = getRequestOrigin(request.headers, request.nextUrl.origin);
  return new URL(path, `${origin}/`);
}

/** Server Actions / RSC: resolve origin from incoming request headers. */
export async function getServerRequestOrigin(): Promise<string> {
  const headerList = await headers();
  return getRequestOrigin(headerList);
}

/** Server Actions / RSC: build an absolute URL for a path. */
export async function absoluteAppUrl(path: string): Promise<string> {
  const origin = await getServerRequestOrigin();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}
