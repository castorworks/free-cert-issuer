"use client";

import { useState } from "react";
import JSZip from "jszip";

type Step = "input" | "challenge" | "issued";
type ChallengeType = "http-01" | "dns-01";

interface ChallengeInfo {
  domain: string;
  type: ChallengeType;
  token: string;
  keyAuthorization: string;
  dnsValue?: string;
}

interface OrderInfo {
  orderId: string;
  domains: string[];
  challengeType: ChallengeType;
  challenges: ChallengeInfo[];
  autoVerify?: boolean;
}

interface IssuedCertificate {
  certificate: string;
  privateKey: string;
  chain: string;
}

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [domains, setDomains] = useState("");
  const [challengeType, setChallengeType] = useState<ChallengeType>("dns-01");
  const [autoDns, setAutoDns] = useState(true);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const [useStaging, setUseStaging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [certificate, setCertificate] = useState<IssuedCertificate | null>(
    null
  );

  async function handleCreateOrder() {
    setError("");
    setLoading(true);

    try {
      const domainList = domains
        .split(/[\n,]+/)
        .map((d) => d.trim())
        .filter(Boolean);

      if (domainList.length === 0) {
        setError("Please enter at least one domain");
        return;
      }

      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domains: domainList,
          challengeType,
          useStaging,
          autoDns: challengeType === "dns-01" && autoDns,
          aliyunAccessKeyId: autoDns ? accessKeyId : undefined,
          aliyunAccessKeySecret: autoDns ? accessKeySecret : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create order");
        return;
      }

      setOrderInfo(data);

      // If auto DNS, skip challenge step and go straight to finalize
      if (data.autoVerify) {
        await doFinalize(data.orderId);
      } else {
        setStep("challenge");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function doFinalize(orderId: string) {
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to finalize order");
        return;
      }

      setCertificate(data);
      setStep("issued");
    } catch {
      setError("Network error. Please try again.");
    }
  }

  async function handleFinalize() {
    if (!orderInfo) return;
    setError("");
    setLoading(true);

    try {
      await doFinalize(orderInfo.orderId);
    } finally {
      setLoading(false);
    }
  }

  function downloadFile(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadZip() {
    if (!certificate) return;
    const zip = new JSZip();
    zip.file("certificate.pem", certificate.certificate);
    zip.file("private-key.pem", certificate.privateKey);
    zip.file("fullchain.pem", certificate.chain);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ssl-certificate.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setStep("input");
    setDomains("");
    setOrderInfo(null);
    setCertificate(null);
    setError("");
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2">🔒 Free SSL Certificate</h1>
        <p className="text-gray-600">
          Issue free SSL/TLS certificates powered by Let&apos;s Encrypt
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Step 1: Input */}
      {step === "input" && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
          <div>
            <label
              htmlFor="domains"
              className="block text-sm font-medium mb-2"
            >
              Domain Names
            </label>
            <textarea
              id="domains"
              className="w-full border rounded-lg px-4 py-3 text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={4}
              placeholder={"example.com\n*.example.com\nwww.example.com"}
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              One domain per line, or comma-separated. Supports wildcards
              (*.example.com).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Verification Method
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="challengeType"
                  value="http-01"
                  checked={challengeType === "http-01"}
                  onChange={() => {
                    setChallengeType("http-01");
                    setAutoDns(false);
                  }}
                  className="text-blue-600"
                />
                <span className="text-sm">HTTP-01 (File Verification)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="challengeType"
                  value="dns-01"
                  checked={challengeType === "dns-01"}
                  onChange={() => setChallengeType("dns-01")}
                  className="text-blue-600"
                />
                <span className="text-sm">DNS-01 (TXT Record)</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {challengeType === "http-01"
                ? "Place a file on your web server. Simple but doesn't support wildcards."
                : "Add a DNS TXT record. Required for wildcard certificates."}
            </p>
          </div>

          {challengeType === "dns-01" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDns}
                  onChange={(e) => setAutoDns(e.target.checked)}
                  className="text-blue-600"
                />
                <span className="text-sm font-medium text-blue-800">
                  Auto-verify via Aliyun DNS API
                </span>
              </label>
              <p className="text-xs text-blue-600 ml-6">
                Automatically add/remove DNS TXT records using Aliyun DNS.
                One-click issuance, no manual steps.
              </p>

              {autoDns && (
                <div className="ml-6 space-y-2 pt-2 border-t border-blue-200">
                  <div>
                    <label
                      htmlFor="accessKeyId"
                      className="block text-xs font-medium text-blue-800 mb-1"
                    >
                      AccessKey ID
                    </label>
                    <input
                      id="accessKeyId"
                      type="text"
                      className="w-full border border-blue-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="LTAI5t..."
                      value={accessKeyId}
                      onChange={(e) => setAccessKeyId(e.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="accessKeySecret"
                      className="block text-xs font-medium text-blue-800 mb-1"
                    >
                      AccessKey Secret
                    </label>
                    <input
                      id="accessKeySecret"
                      type="password"
                      className="w-full border border-blue-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter your AccessKey Secret"
                      value={accessKeySecret}
                      onChange={(e) => setAccessKeySecret(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-blue-500">
                    Credentials are used only for this request and not stored on
                    the server. Use a RAM sub-account with AliyunDNSFullAccess
                    permission.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useStaging}
                onChange={(e) => setUseStaging(e.target.checked)}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-600">
                Use staging environment (for testing, certificates won&apos;t be
                trusted)
              </span>
            </label>
          </div>

          <button
            onClick={handleCreateOrder}
            disabled={loading || !domains.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? autoDns && challengeType === "dns-01"
                ? "Issuing (auto DNS verification)..."
                : "Creating Order..."
              : "Issue Certificate"}
          </button>
        </div>
      )}

      {/* Step 2: Challenge (only shown for manual verification) */}
      {step === "challenge" && orderInfo && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
          <h2 className="text-xl font-semibold">
            Complete Domain Verification
          </h2>
          <p className="text-sm text-gray-600">
            Complete the following verification steps, then click
            &quot;Verify & Issue&quot;.
          </p>

          <div className="space-y-4">
            {orderInfo.challenges.map((ch, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-2">
                <h3 className="font-medium text-sm">{ch.domain}</h3>

                {ch.type === "http-01" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">
                      Create a file at the following URL on your server:
                    </p>
                    <code className="block bg-gray-100 px-3 py-2 rounded text-xs break-all">
                      http://{ch.domain}/.well-known/acme-challenge/{ch.token}
                    </code>
                    <p className="text-xs text-gray-600">
                      With the following content:
                    </p>
                    <code className="block bg-gray-100 px-3 py-2 rounded text-xs break-all">
                      {ch.keyAuthorization}
                    </code>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">
                      Add a DNS TXT record:
                    </p>
                    <div className="bg-gray-100 px-3 py-2 rounded text-xs space-y-1">
                      <div>
                        <span className="text-gray-500">Name: </span>
                        <code className="break-all">
                          _acme-challenge.{ch.domain}
                        </code>
                      </div>
                      <div>
                        <span className="text-gray-500">Value: </span>
                        <code className="break-all">{ch.dnsValue}</code>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 border border-gray-300 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleFinalize}
              disabled={loading}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Verifying..." : "Verify & Issue"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Certificate Issued */}
      {step === "issued" && certificate && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
          <div className="text-center">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-xl font-semibold">Certificate Issued!</h2>
            <p className="text-sm text-gray-600 mt-1">
              Download your certificate files below.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={downloadZip}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              📦 Download All (ssl-certificate.zip)
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() =>
                  downloadFile(certificate.certificate, "certificate.pem")
                }
                className="border border-gray-200 text-gray-600 py-2 rounded-lg text-xs hover:bg-gray-50 transition-colors"
              >
                📄 certificate.pem
              </button>
              <button
                onClick={() =>
                  downloadFile(certificate.privateKey, "private-key.pem")
                }
                className="border border-gray-200 text-gray-600 py-2 rounded-lg text-xs hover:bg-gray-50 transition-colors"
              >
                🔑 private-key.pem
              </button>
              <button
                onClick={() =>
                  downloadFile(certificate.chain, "fullchain.pem")
                }
                className="border border-gray-200 text-gray-600 py-2 rounded-lg text-xs hover:bg-gray-50 transition-colors"
              >
                🔗 fullchain.pem
              </button>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Important:</strong> Keep your private key secure. The
              certificate is valid for 90 days. Set a reminder to renew before
              expiration.
            </p>
          </div>

          <button
            onClick={reset}
            className="w-full border border-gray-300 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Issue Another Certificate
          </button>
        </div>
      )}

      <footer className="text-center mt-12 text-xs text-gray-400">
        <p>
          Powered by Let&apos;s Encrypt ACME v2 Protocol. Certificates are free
          and valid for 90 days.
        </p>
      </footer>
    </main>
  );
}
