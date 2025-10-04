import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";
import { GenerateReply } from "@/components/generate-reply";

export default function AppPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to continue",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {/* Main App Interface */}
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">Generate Reply</h1>
          <p className="text-muted-foreground">
            Paste a tweet text or URL to generate an authentic reply
          </p>
        </div>

        <GenerateReply />
      </div>
    </div>
  );
}
