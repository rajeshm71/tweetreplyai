import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PricingCards } from "@/components/pricing-cards";

export default function Pricing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">TweetReply</span>
          </div>
          <h1 className="text-3xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start with a free trial, then choose the plan that fits your engagement needs.
          </p>
        </div>

        {/* Pricing Cards */}
        <PricingCards />

        {/* FAQ Section */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">How do the reply quotas work?</h3>
                <p className="text-muted-foreground text-sm">
                  Your quota resets automatically based on your plan. Trial users get 10 replies per day, 
                  weekly subscribers get 700 replies every 7 days, and monthly subscribers get 3,000 replies every 30 days.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Can I use both the extension and web app?</h3>
                <p className="text-muted-foreground text-sm">
                  Yes! Your subscription covers both the Chrome extension and the mobile-friendly web interface. 
                  Your quota is shared across both platforms.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">How authentic are the AI-generated replies?</h3>
                <p className="text-muted-foreground text-sm">
                  Our AI is trained to generate human-like, contextual replies under 25 words. 
                  Most users post our suggestions without any edits. We avoid generic AI clichés and hashtags.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Back to App */}
        {isAuthenticated && (
          <div className="text-center mt-12">
            <Button variant="ghost" asChild>
              <Link href="/app" data-testid="link-back-to-app">← Back to app</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
