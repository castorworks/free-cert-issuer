import acme from "acme-client";
import type { Challenge } from "acme-client/types/rfc8555";
import {
  addDnsTxtRecord,
  removeDnsTxtRecord,
  waitForDnsPropagation,
  type AliyunCredentials,
} from "./aliyun-dns";

export type ChallengeType = "http-01" | "dns-01";

export interface OrderInfo {
  orderId: string;
  domains: string[];
  challengeType: ChallengeType;
  challenges: ChallengeInfo[];
  /** If dns-01 with auto mode, challenges are already set up */
  autoVerify?: boolean;
}

export interface ChallengeInfo {
  domain: string;
  type: ChallengeType;
  token: string;
  /** For http-01: the key authorization content to serve */
  keyAuthorization: string;
  /** For dns-01: the DNS TXT record value */
  dnsValue?: string;
}

export interface IssuedCertificate {
  certificate: string;
  privateKey: string;
  chain: string;
}

// In-memory store for pending orders (in production, use Redis or DB)
const pendingOrders = new Map<
  string,
  {
    client: acme.Client;
    order: acme.Order;
    accountKey: Buffer;
    domainKey: Buffer;
    domains: string[];
    dnsRecordIds: string[];
    aliyunCredentials?: AliyunCredentials;
    challenges: Array<{
      domain: string;
      challenge: Challenge;
      keyAuthorization: string;
    }>;
  }
>();

function generateOrderId(): string {
  return crypto.randomUUID();
}

/**
 * Create a new ACME order for the given domains
 */
export async function createOrder(
  domains: string[],
  challengeType: ChallengeType,
  options?: { caUrl?: string; autoDns?: boolean; aliyunCredentials?: AliyunCredentials }
): Promise<OrderInfo> {
  const { caUrl, autoDns, aliyunCredentials } = options || {};

  // Generate account key
  const accountKey = await acme.crypto.createPrivateRsaKey(2048);

  // Create ACME client
  const client = new acme.Client({
    directoryUrl: caUrl || acme.directory.letsencrypt.production,
    accountKey,
  });

  // Register account
  await client.createAccount({
    termsOfServiceAgreed: true,
  });

  // Create order
  const order = await client.createOrder({
    identifiers: domains.map((d) => ({ type: "dns", value: d })),
  });

  // Get authorizations and challenges
  const authorizations = await client.getAuthorizations(order);

  const challengeInfos: ChallengeInfo[] = [];
  const challengeDetails: Array<{
    domain: string;
    challenge: Challenge;
    keyAuthorization: string;
  }> = [];

  for (const auth of authorizations) {
    const challenge = auth.challenges.find((c) => c.type === challengeType);
    if (!challenge) {
      throw new Error(
        `Challenge type ${challengeType} not available for ${auth.identifier.value}`
      );
    }

    const keyAuthorization =
      await client.getChallengeKeyAuthorization(challenge);

    const info: ChallengeInfo = {
      domain: auth.identifier.value,
      type: challengeType,
      token: challenge.token,
      keyAuthorization,
    };

    if (challengeType === "dns-01") {
      info.dnsValue = keyAuthorization;
    }

    challengeInfos.push(info);
    challengeDetails.push({
      domain: auth.identifier.value,
      challenge,
      keyAuthorization,
    });
  }

  // Generate domain key for CSR
  const domainKey = await acme.crypto.createPrivateRsaKey(2048);

  // If auto DNS mode, add TXT records via Aliyun DNS API
  const dnsRecordIds: string[] = [];
  if (autoDns && challengeType === "dns-01") {
    for (const ch of challengeDetails) {
      const recordId = await addDnsTxtRecord(
        ch.domain,
        ch.keyAuthorization,
        aliyunCredentials
      );
      dnsRecordIds.push(recordId);
    }

    // Wait for DNS propagation
    for (const ch of challengeDetails) {
      await waitForDnsPropagation(
        ch.domain,
        ch.keyAuthorization,
        aliyunCredentials
      );
    }
  }

  const orderId = generateOrderId();
  pendingOrders.set(orderId, {
    client,
    order,
    accountKey,
    domainKey,
    domains,
    dnsRecordIds,
    aliyunCredentials,
    challenges: challengeDetails,
  });

  // Auto-cleanup after 30 minutes
  setTimeout(() => {
    const entry = pendingOrders.get(orderId);
    if (entry) {
      // Clean up DNS records if they exist
      for (const id of entry.dnsRecordIds) {
        removeDnsTxtRecord(id, entry.aliyunCredentials).catch(() => {});
      }
      pendingOrders.delete(orderId);
    }
  }, 30 * 60 * 1000);

  return {
    orderId,
    domains,
    challengeType,
    challenges: challengeInfos,
    autoVerify: autoDns && challengeType === "dns-01",
  };
}

/**
 * Verify challenges and finalize the order to get the certificate
 */
export async function finalizeOrder(
  orderId: string
): Promise<IssuedCertificate> {
  const pending = pendingOrders.get(orderId);
  if (!pending) {
    throw new Error("Order not found or expired");
  }

  const { client, order, domainKey, domains, challenges, dnsRecordIds, aliyunCredentials } = pending;

  // Complete all challenges
  for (const { challenge } of challenges) {
    await client.completeChallenge(challenge);
  }

  // Wait for validation
  await client.waitForValidStatus(order);

  // Create CSR using the original order domains (not the challenge domains)
  const [, csr] = await acme.crypto.createCsr(
    {
      commonName: domains[0],
      altNames: domains.length > 1 ? domains : undefined,
    },
    domainKey
  );

  // Finalize order
  await client.finalizeOrder(order, csr);

  // Get certificate
  const certificate = await client.getCertificate(order);

  // Clean up DNS records
  for (const recordId of dnsRecordIds) {
    await removeDnsTxtRecord(recordId, aliyunCredentials).catch(() => {});
  }

  // Clean up
  pendingOrders.delete(orderId);

  return {
    certificate: certificate || "",
    privateKey: domainKey.toString(),
    chain: certificate || "",
  };
}
