import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";

const ALLOWED_RETURN_PATHS = ["/", "/app", "/app/pricing", "/profile", "/settings"];

function getReturnUrlFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("returnUrl");
  if (!raw) return null;
  try {
    const pathWithQuery = raw.startsWith("http") ? new URL(raw).pathname + new URL(raw).search : (raw.startsWith("/") ? raw : new URL(raw, window.location.origin).pathname + new URL(raw, window.location.origin).search);
    const pathOnly = pathWithQuery.split("?")[0];
    if (!ALLOWED_RETURN_PATHS.includes(pathOnly)) return null;
    return pathWithQuery;
  } catch {
    return null;
  }
}

export default function CompleteProfile() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [value, setValue] = useState("");

  const submitMutation = useMutation({
    mutationFn: async (xUsername: string) => {
      const res = await apiRequest("POST", "/api/user/x-username", {
        xUsername: xUsername.trim().replace(/^@+/, ""),
      });
      return res.json();
    },
    onSuccess: (data: { xUsername: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Success", description: "X username saved." });
      const returnUrl = getReturnUrlFromQuery();
      navigate(returnUrl || "/");
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to save X username.",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = value.trim().replace(/^@+/, "");
    if (!normalized) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter your X username.",
      });
      return;
    }
    submitMutation.mutate(normalized);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Complete your profile</h1>
          <p className="text-muted-foreground">
            Add your X username to continue. You can enter it with or without @.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="x-username">X username</Label>
            <Input
              id="x-username"
              type="text"
              placeholder="your handle without @"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={100}
              autoComplete="username"
              disabled={submitMutation.isPending}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Saving..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
