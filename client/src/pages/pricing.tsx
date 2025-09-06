import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PricingCards } from "@/components/pricing-cards";

export default function Pricing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <section className="section-padding">
        <div className="container">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                <MessageCircle className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold tracking-tight">TweetReply</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold mb-6 gradient-text">Choose your plan</h1>
            <p className="text-xl text-muted-foreground content-max leading-relaxed">
              Start with a free trial, then choose the plan that fits your engagement needs.
            </p>
          </div>

        {/* Pricing Cards */}
        <PricingCards />

          {/* FAQ Section */}
          <section className="mt-24">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Frequently asked questions</h2>
              <p className="text-lg text-muted-foreground">Everything you need to know about TweetReply</p>
            </div>
            <div className="max-w-4xl mx-auto space-y-6">
              <Card className="border-2 hover:shadow-lg smooth-transition">
                <CardContent className="p-8">
                  <h3 className="text-lg font-semibold mb-3">How do the reply quotas work?</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Your quota resets automatically based on your plan. Trial users get 10 replies per day, 
                    weekly subscribers get 700 replies every 7 days, and monthly subscribers get 3,000 replies every 30 days.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-2 hover:shadow-lg smooth-transition">
                <CardContent className="p-8">
                  <h3 className="text-lg font-semibold mb-3">Can I use both the extension and web app?</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Yes! Your subscription covers both the Chrome extension and the mobile-friendly web interface. 
                    Your quota is shared across both platforms.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-2 hover:shadow-lg smooth-transition">
                <CardContent className="p-8">
                  <h3 className="text-lg font-semibold mb-3">How authentic are the AI-generated replies?</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Our AI is trained to generate human-like, contextual replies under 25 words. 
                    Most users post our suggestions without any edits. We avoid generic AI clichés and hashtags.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Back to App */}
          {isAuthenticated && (
            <div className="text-center mt-16">
              <Button variant="ghost" asChild className="smooth-transition hover:bg-muted/50">
                <Link href="/app" data-testid="link-back-to-app">← Back to app</Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
