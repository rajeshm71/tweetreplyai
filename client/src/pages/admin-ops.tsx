import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface OpsMetrics {
  dau: number;
  replies24h: number;
  signups24h: number;
  signups7d: number;
  activeSubscriptions: number;
  canceledSubscriptions30d: number;
  topErrors: { code: string; count: number }[];
  telemetryEvents24h: number;
  generatedAt: string;
}

const STORAGE_KEY = "admin.opsSecret";

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default function AdminOpsPage() {
  const [secret, setSecret] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem(STORAGE_KEY) || "";
  });
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ops-metrics", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as OpsMetrics;
      setMetrics(data);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(STORAGE_KEY, secret);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold mb-2">Operator dashboard</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Requires <code>ADMIN_SECRET</code>. Secret is kept in sessionStorage, never sent to analytics.
        </p>

        <div className="flex gap-2 mb-6">
          <Input
            type="password"
            placeholder="ADMIN_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="max-w-md"
          />
          <Button onClick={load} disabled={!secret || loading}>
            {loading ? "Loading..." : "Load metrics"}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {metrics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Metric label="DAU (24h)" value={metrics.dau} />
              <Metric label="Replies (24h)" value={metrics.replies24h} />
              <Metric label="Signups (24h)" value={metrics.signups24h} />
              <Metric label="Signups (7d)" value={metrics.signups7d} />
              <Metric label="Active subscriptions" value={metrics.activeSubscriptions} />
              <Metric label="Canceled (30d)" value={metrics.canceledSubscriptions30d} />
              <Metric label="Telemetry events (24h)" value={metrics.telemetryEvents24h} />
              <Metric
                label="Generated at"
                value={new Date(metrics.generatedAt).toLocaleTimeString()}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Top extension error codes (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.topErrors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No errors recorded.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {metrics.topErrors.map((err) => (
                      <li key={err.code} className="flex justify-between py-2 text-sm">
                        <span className="font-mono">{err.code}</span>
                        <span>{err.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Fix (review #8): the backend caps the telemetry query at
                    5,000 rows per 24h window. Make that explicit so
                    operators don't mistake the cap for true volume. */}
                <p className="mt-3 text-xs text-muted-foreground">
                  Aggregated from the most recent 5,000 telemetry events in
                  the last 24 hours.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
