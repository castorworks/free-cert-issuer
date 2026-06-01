import Alidns20150109, * as $Alidns from "@alicloud/alidns20150109";
import * as $OpenApi from "@alicloud/openapi-client";
import * as $Util from "@alicloud/tea-util";

export interface AliyunCredentials {
  accessKeyId: string;
  accessKeySecret: string;
}

function getClient(credentials?: AliyunCredentials): Alidns20150109 {
  const accessKeyId =
    credentials?.accessKeyId || process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret =
    credentials?.accessKeySecret || process.env.ALIYUN_ACCESS_KEY_SECRET;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      "Aliyun AccessKey ID and Secret are required"
    );
  }

  const config = new $OpenApi.Config({
    accessKeyId,
    accessKeySecret,
    endpoint: "alidns.cn-hangzhou.aliyuncs.com",
  });

  return new Alidns20150109(config);
}

/**
 * Extract the root domain and subdomain prefix from a full domain.
 * e.g. "www.example.com" -> { domain: "example.com", rr: "_acme-challenge.www" }
 * e.g. "example.com" -> { domain: "example.com", rr: "_acme-challenge" }
 * e.g. "*.example.com" -> { domain: "example.com", rr: "_acme-challenge" }
 */
function parseDomain(fullDomain: string): { domain: string; rr: string } {
  // Remove wildcard prefix
  const domain = fullDomain.replace(/^\*\./, "");
  const parts = domain.split(".");

  // Assume the last two parts are the root domain
  // For domains like .co.uk, this would need more logic, but covers most cases
  if (parts.length <= 2) {
    return { domain, rr: "_acme-challenge" };
  }

  const rootDomain = parts.slice(-2).join(".");
  const subdomain = parts.slice(0, -2).join(".");
  return { domain: rootDomain, rr: `_acme-challenge.${subdomain}` };
}

/**
 * Add a DNS TXT record for ACME challenge verification
 */
export async function addDnsTxtRecord(
  fullDomain: string,
  value: string,
  credentials?: AliyunCredentials
): Promise<string> {
  const client = getClient(credentials);
  const { domain, rr } = parseDomain(fullDomain);

  const request = new $Alidns.AddDomainRecordRequest({
    domainName: domain,
    RR: rr,
    type: "TXT",
    value,
    TTL: 600,
  });

  const runtime = new $Util.RuntimeOptions({});
  const response = await client.addDomainRecordWithOptions(request, runtime);

  const recordId = response.body?.recordId;
  if (!recordId) {
    throw new Error("Failed to add DNS record: no recordId returned");
  }

  return recordId;
}

/**
 * Remove a DNS TXT record after verification
 */
export async function removeDnsTxtRecord(
  recordId: string,
  credentials?: AliyunCredentials
): Promise<void> {
  const client = getClient(credentials);

  const request = new $Alidns.DeleteDomainRecordRequest({
    recordId,
  });

  const runtime = new $Util.RuntimeOptions({});
  await client.deleteDomainRecordWithOptions(request, runtime);
}

/**
 * Wait for DNS propagation by checking the record exists
 */
export async function waitForDnsPropagation(
  fullDomain: string,
  expectedValue: string,
  credentials?: AliyunCredentials,
  maxAttempts = 20,
  intervalMs = 5000
): Promise<boolean> {
  const client = getClient(credentials);
  const { domain, rr } = parseDomain(fullDomain);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const request = new $Alidns.DescribeDomainRecordsRequest({
        domainName: domain,
        RRKeyWord: rr,
        typeKeyWord: "TXT",
      });

      const runtime = new $Util.RuntimeOptions({});
      const response = await client.describeDomainRecordsWithOptions(
        request,
        runtime
      );

      const records = response.body?.domainRecords?.record || [];
      const found = records.some(
        (r) => r.RR === rr && r.value === expectedValue
      );

      if (found) return true;
    } catch {
      // Ignore errors during polling
    }

    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return false;
}
