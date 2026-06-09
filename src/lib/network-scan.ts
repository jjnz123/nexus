import { createConnection } from "net";

const MAX_HOSTS = 254;
const DEFAULT_PORTS = [80, 443, 22, 8080];

function isValidIpv4(octets: number[]) {
  return octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

function ipToInt(octets: number[]) {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function intToIp(value: number) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

export function parseScanRange(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.includes("/")) {
    const [base, prefixRaw] = trimmed.split("/");
    const prefix = Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 8 || prefix > 30) {
      throw new Error("CIDR prefix must be between /8 and /30");
    }
    const octets = base.split(".").map(Number);
    if (!isValidIpv4(octets)) throw new Error("Invalid IP address in CIDR");

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const network = ipToInt(octets) & mask;
    const broadcast = network | (~mask >>> 0);
    const hosts: string[] = [];

    for (let ip = network + 1; ip < broadcast; ip += 1) {
      hosts.push(intToIp(ip));
      if (hosts.length >= MAX_HOSTS) break;
    }
    return hosts;
  }

  if (trimmed.includes("-")) {
    const [startRaw, endRaw] = trimmed.split("-");
    const startOctets = startRaw.trim().split(".").map(Number);
    if (!isValidIpv4(startOctets)) throw new Error("Invalid start IP");

    let endOctets: number[];
    if (endRaw.includes(".")) {
      endOctets = endRaw.trim().split(".").map(Number);
    } else {
      endOctets = [...startOctets.slice(0, 3), Number(endRaw)];
    }
    if (!isValidIpv4(endOctets)) throw new Error("Invalid end IP");

    const start = ipToInt(startOctets);
    const end = ipToInt(endOctets);
    if (end < start) throw new Error("End IP must be greater than start IP");

    const hosts: string[] = [];
    for (let ip = start; ip <= end; ip += 1) {
      hosts.push(intToIp(ip));
      if (hosts.length >= MAX_HOSTS) break;
    }
    return hosts;
  }

  const octets = trimmed.split(".").map(Number);
  if (!isValidIpv4(octets)) throw new Error("Invalid IP address");
  return [trimmed];
}

function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

export async function probeHost(
  host: string,
  ports = DEFAULT_PORTS,
  timeoutMs = 800
): Promise<{ ip: string; openPorts: number[]; latencyMs: number | null }> {
  const start = Date.now();
  const openPorts: number[] = [];

  await Promise.all(
    ports.map(async (port) => {
      if (await probePort(host, port, timeoutMs)) openPorts.push(port);
    })
  );

  openPorts.sort((a, b) => a - b);
  return {
    ip: host,
    openPorts,
    latencyMs: openPorts.length ? Date.now() - start : null,
  };
}

export async function scanNetworkRange(
  range: string,
  options?: { ports?: number[]; timeoutMs?: number; concurrency?: number }
) {
  const hosts = parseScanRange(range);
  if (!hosts.length) throw new Error("No hosts to scan");
  if (hosts.length > MAX_HOSTS) {
    throw new Error(`Scan limited to ${MAX_HOSTS} hosts. Narrow your range.`);
  }

  const ports = options?.ports ?? DEFAULT_PORTS;
  const timeoutMs = options?.timeoutMs ?? 800;
  const concurrency = options?.concurrency ?? 24;
  const results: Awaited<ReturnType<typeof probeHost>>[] = [];

  for (let i = 0; i < hosts.length; i += concurrency) {
    const batch = hosts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((host) => probeHost(host, ports, timeoutMs))
    );
    for (const result of batchResults) {
      if (result.openPorts.length) results.push(result);
    }
  }

  return results.sort((a, b) =>
    a.ip.localeCompare(b.ip, undefined, { numeric: true })
  );
}
