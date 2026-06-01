import { createOrder, type ChallengeType } from "@/lib/acme";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      domains,
      challengeType,
      useStaging,
      autoDns,
      aliyunAccessKeyId,
      aliyunAccessKeySecret,
    } = body as {
      domains: string[];
      challengeType: ChallengeType;
      useStaging?: boolean;
      autoDns?: boolean;
      aliyunAccessKeyId?: string;
      aliyunAccessKeySecret?: string;
    };

    if (!domains || domains.length === 0) {
      return Response.json(
        { error: "At least one domain is required" },
        { status: 400 }
      );
    }

    // Validate domains
    const domainRegex =
      /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    for (const domain of domains) {
      if (!domainRegex.test(domain)) {
        return Response.json(
          { error: `Invalid domain: ${domain}` },
          { status: 400 }
        );
      }
    }

    // Wildcard domains require dns-01
    const hasWildcard = domains.some((d) => d.startsWith("*."));
    if (hasWildcard && challengeType !== "dns-01") {
      return Response.json(
        { error: "Wildcard domains require DNS-01 challenge" },
        { status: 400 }
      );
    }

    // Auto DNS requires dns-01
    if (autoDns && challengeType !== "dns-01") {
      return Response.json(
        { error: "Auto DNS verification requires DNS-01 challenge type" },
        { status: 400 }
      );
    }

    // Auto DNS requires credentials (from request or env)
    const hasCredentials =
      (aliyunAccessKeyId && aliyunAccessKeySecret) ||
      (process.env.ALIYUN_ACCESS_KEY_ID && process.env.ALIYUN_ACCESS_KEY_SECRET);

    if (autoDns && !hasCredentials) {
      return Response.json(
        { error: "Aliyun AccessKey ID and Secret are required for auto DNS verification" },
        { status: 400 }
      );
    }

    const caUrl = useStaging
      ? "https://acme-staging-v02.api.letsencrypt.org/directory"
      : undefined;

    // Use user-provided credentials, fall back to env vars
    const aliyunCredentials =
      aliyunAccessKeyId && aliyunAccessKeySecret
        ? { accessKeyId: aliyunAccessKeyId, accessKeySecret: aliyunAccessKeySecret }
        : undefined;

    const orderInfo = await createOrder(domains, challengeType, {
      caUrl,
      autoDns,
      aliyunCredentials,
    });

    return Response.json(orderInfo);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
