import { readFileSync } from "fs";
import { resolve } from "path";
import ipRangeCheck from "ip-range-check";
import { minimatch } from "minimatch";
import dns from "dns/promises";

const SCOPE_PATH = process.env.SCOPE_FILE || resolve(process.cwd(), "scope.json");
let _scope = null;

export function loadScope() {
  if (!_scope) _scope = JSON.parse(readFileSync(SCOPE_PATH, "utf8"));
  return _scope;
}

export function isDomainInScope(domain) {
  const scope = loadScope();
  const d = domain.toLowerCase().trim();
  for (const blocked of scope.out_of_scope?.domains || []) {
    if (minimatch(d, blocked.toLowerCase()))
      return { allowed: false, reason: `Matches out-of-scope: ${blocked}` };
  }
  for (const pattern of scope.in_scope?.domains || []) {
    if (minimatch(d, pattern.toLowerCase()))
      return { allowed: true, reason: `Matches in-scope: ${pattern}` };
  }
  return { allowed: false, reason: `Not in any in-scope pattern` };
}

export function isIPInScope(ip) {
  const scope = loadScope();
  if (!scope.in_scope?.ip_ranges?.length)
    return { allowed: null, reason: "No IP ranges defined — validate via domain" };
  return ipRangeCheck(ip, scope.in_scope.ip_ranges)
    ? { allowed: true, reason: "IP in scope range" }
    : { allowed: false, reason: `IP ${ip} not in any scope range` };
}

export async function validateDomainAndIPs(domain) {
  const domainCheck = isDomainInScope(domain);
  if (!domainCheck.allowed) return domainCheck;
  try {
    const addresses = await dns.resolve4(domain);
    for (const ip of addresses) {
      const ipCheck = isIPInScope(ip);
      if (ipCheck.allowed === false)
        return { allowed: false, reason: `${domain} resolves to out-of-scope IP ${ip}` };
    }
    return { allowed: true, reason: "Domain and IPs in scope", ips: addresses };
  } catch {
    return { allowed: true, reason: "Domain in scope (DNS resolution failed, proceeding)" };
  }
}

export function isURLInScope(url) {
  const scope = loadScope();
  try {
    const parsed = new URL(url);
    const domainCheck = isDomainInScope(parsed.hostname);
    if (!domainCheck.allowed) return domainCheck;
    if (scope.in_scope?.url_prefixes?.length) {
      const ok = scope.in_scope.url_prefixes.some(p => url.startsWith(p));
      if (!ok) return { allowed: false, reason: "URL does not match any in-scope prefix" };
    }
    return { allowed: true, reason: "URL in scope" };
  } catch {
    return { allowed: false, reason: `Invalid URL: ${url}` };
  }
}

export function isTestTypeAllowed(type) {
  const scope = loadScope();
  if (scope.forbidden_test_types?.includes(type))
    return { allowed: false, reason: `Test type '${type}' is forbidden` };
  if (scope.allowed_test_types?.length && !scope.allowed_test_types.includes(type))
    return { allowed: false, reason: `Test type '${type}' not in allowed list` };
  return { allowed: true };
}
