import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Check, Zap, ArrowRight, Crown, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PricingCards } from "@/components/pricing-cards";

export default function Pricing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass-effect border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-xl">TweetReply</span>
          </div>
          
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <Button variant="ghost" asChild className="smooth-transition hover-scale">
                <Link href="/app">← Back to app</Link>
              </Button>
            ) : (
              <Button 
                onClick={() => window.location.href = '/api/login'}
                className="bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg hover-lift border-0"
              >
                Sign In
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="hero-gradient grid-pattern">
          <div className="container section-padding relative">
            {/* Floating Elements */}
            <div className="absolute top-20 left-10 w-20 h-20 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-xl floating-animation" />
            <div className="absolute top-40 right-20 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full blur-2xl floating-animation" style={{ animationDelay: '-2s' }} />
            
            <div className="text-center mb-20 relative z-10">
              <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium glass-effect border border-primary/20">
                <Crown className="w-4 h-4 mr-2" />
                Choose Your Plan
              </Badge>
              
              <h1 className="text-5xl md:text-7xl font-display font-bold mb-8 leading-none">
                <span className="gradient-text">Pricing That</span>
                <br />
                <span className="text-foreground">Scales With You</span>
              </h1>
              
              <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
                Start with a free trial, then choose the plan that fits your engagement needs. 
                <span className="text-foreground font-semibold"> No hidden fees, cancel anytime.</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="section-padding">
        <div className="container">
          <PricingCards />
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding">
        <div className="container">
          <Card className="neomorphic border-0 p-12 text-center relative overflow-hidden max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10" />
            <div className="relative z-10">
              <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
                <Rocket className="w-4 h-4 mr-2" />
                Ready to Start Replying?
              </Badge>
              <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
                Start Your <span className="gradient-text">Free Trial</span> Today
              </h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of professionals who are already transforming their social media engagement with TweetReply.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button 
                  size="lg"
                  onClick={() => window.location.href = '/api/login'}
                  className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift pulse-glow border-0 font-semibold"
                >
                  <Sparkles className="w-5 h-5 mr-3" />
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-3" />
                </Button>
                <div className="flex items-center space-x-3 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-primary" />
                  <span>No credit card required</span>
                  <Check className="w-4 h-4 text-primary" />
                  <span>7-day free trial</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-20">
        <div className="container py-12">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <span className="font-display font-bold text-lg">TweetReply</span>
            </div>
            <p className="text-muted-foreground">
              © 2024 TweetReply. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}