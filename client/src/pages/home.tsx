import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Download, LogOut, Sparkles, Zap, TrendingUp, ArrowRight, Star, CheckCircle, Brain, Rocket, Crown, Shield, ChevronRight, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PricingCards } from "@/components/pricing-cards";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

type Usage = {
  today: number;
  thisWeek: number;
  thisMonth: number;
};

function UsageBadge() {
  const { data: usage } = useQuery<Usage>({
    queryKey: ["/api/usage"],
    retry: false,
  });

  if (!usage) return null;

  return (
    <Badge variant="secondary" className="glass-effect border border-primary/20">
      <Zap className="w-3 h-3 mr-1" />
      {usage.today} today
    </Badge>
  );
}

export default function Home() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();

  const { data: usage } = useQuery<Usage>({
    queryKey: ["/api/usage"],
    retry: false,
    enabled: !!user,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [user, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-6" />
          <p className="text-lg font-medium text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const faqs = [
    {
      question: "How do the reply quotas work?",
      answer: "Your quota resets automatically based on your plan. Trial users get 10 replies per day, weekly subscribers get 700 replies every 7 days, and monthly subscribers get 3,000 replies every 30 days."
    },
    {
      question: "Can I use both the extension and web app?",
      answer: "Yes! Your subscription covers both the Chrome extension and the mobile-friendly web interface. Your quota is shared across both platforms."
    },
    {
      question: "How authentic are the AI-generated replies?",
      answer: "Our AI is trained to generate human-like, contextual replies under 25 words. Most users post our suggestions without any edits. We avoid generic AI clichés and hashtags."
    },
    {
      question: "What AI models do you use?",
      answer: "We use the latest GPT and Gemini models, automatically selecting the best model based on tweet complexity for optimal results."
    },
    {
      question: "Can I cancel anytime?",
      answer: "Absolutely! You can cancel your subscription at any time. Your plan will remain active until the end of your current billing cycle."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass-effect border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-xl">TweetReply</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <UsageBadge />
            <Button 
              variant="ghost" 
              onClick={() => window.location.href = '/api/logout'}
              data-testid="button-logout"
              className="smooth-transition hover:bg-destructive/10 hover:text-destructive hover-scale"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="hero-gradient grid-pattern">
          <div className="container section-padding relative">
            {/* Floating Elements */}
            <div className="absolute top-10 right-10 w-24 h-24 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-2xl floating-animation" />
            <div className="absolute bottom-10 left-10 w-32 h-32 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl floating-animation" style={{ animationDelay: '-3s' }} />
            <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-full blur-2xl floating-animation" style={{ animationDelay: '-5s' }} />
            
            <div className="text-center mb-16 relative z-10">
              <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium glass-effect border border-primary/20 shadow-lg">
                <Star className="w-4 h-4 mr-2" />
                {(user as any)?.firstName ? `Welcome back, ${(user as any).firstName}!` : 'Welcome back!'}
              </Badge>
              
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold mb-8 leading-none">
                <span className="gradient-text">Generate Amazing</span>
                <br />
                <span className="text-foreground">Replies Now</span>
              </h1>
              
              <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
                AI-powered reply generation for Twitter/X. 
                <span className="text-foreground font-semibold"> Create authentic, engaging responses in seconds.</span>
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button 
                  asChild 
                  size="lg"
                  className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift pulse-glow border-0 font-semibold"
                  data-testid="button-get-started"
                >
                  <Link href="/app">
                    <Sparkles className="w-5 h-5 mr-3" />
                    Start Generating
                    <ArrowRight className="w-5 h-5 ml-3" />
                  </Link>
                </Button>
                
                {usage && (
                  <div className="flex items-center space-x-3 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>You've generated <strong className="text-foreground">{usage.thisMonth}</strong> replies this month</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Tour */}
      <section className="section-padding bg-gradient-to-b from-background to-muted/10">
        <div className="container">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
              <Rocket className="w-4 h-4 mr-2" />
              Three Ways to Use TweetReply
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
              Choose Your <span className="gradient-text">Perfect Workflow</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Whether you prefer web, extension, or advanced AI customization, we've got you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Web App */}
            <Card className="neomorphic border-0 hover-lift group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 smooth-transition" />
              <CardContent className="p-8 text-center relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl group-hover:scale-110 group-hover:rotate-3 smooth-transition">
                  <MessageCircle className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-display font-semibold mb-3 text-foreground">Web Application</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Paste tweet text and generate replies instantly with our powerful web interface
                </p>
                <Button 
                  asChild 
                  variant="outline"
                  className="w-full glass-effect border-primary/30 hover:bg-primary/10 smooth-transition group-hover:border-primary"
                  data-testid="link-web-app"
                >
                  <Link href="/app">
                    Open Web App
                    <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 smooth-transition" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Chrome Extension */}
            <Card className="neomorphic border-0 hover-lift group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 smooth-transition" />
              <CardContent className="p-8 text-center relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl group-hover:scale-110 group-hover:rotate-3 smooth-transition">
                  <Download className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-display font-semibold mb-3 text-foreground">Chrome Extension</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Generate replies directly on X (Twitter) with seamless integration
                </p>
                <Button 
                  variant="outline"
                  asChild 
                  className="w-full glass-effect border-cyan-500/30 hover:bg-cyan-500/10 smooth-transition group-hover:border-cyan-500"
                >
                  <a href="/extension.zip" download data-testid="button-download-extension">
                    Download Extension
                    <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 smooth-transition" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* AI Models */}
            <Card className="neomorphic border-0 hover-lift group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10 opacity-0 group-hover:opacity-100 smooth-transition" />
              <CardContent className="p-8 text-center relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl group-hover:scale-110 group-hover:rotate-3 smooth-transition">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-display font-semibold mb-3 text-foreground">AI Model Selection</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Choose from GPT-4o, Gemini, and more for custom reply styles
                </p>
                <Button 
                  asChild
                  variant="outline" 
                  className="w-full glass-effect border-purple-500/30 hover:bg-purple-500/10 smooth-transition group-hover:border-purple-500"
                  data-testid="button-explore-models"
                >
                  <Link href="/app">
                    Explore Models
                    <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 smooth-transition" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Usage Stats - Compact */}
      {usage && (
        <section className="section-padding">
          <div className="container">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Your Activity
                </Badge>
                <h2 className="text-3xl md:text-4xl font-display font-bold">Quick Stats</h2>
              </div>
              
              <div className="grid grid-cols-3 gap-6">
                <Card className="glass-effect border border-primary/20 hover-lift p-6 text-center group">
                  <div className="text-5xl font-bold text-primary mb-2 group-hover:scale-110 smooth-transition">{usage.today}</div>
                  <div className="text-sm font-medium text-muted-foreground">Today</div>
                </Card>
                <Card className="glass-effect border border-primary/20 hover-lift p-6 text-center group">
                  <div className="text-5xl font-bold text-primary mb-2 group-hover:scale-110 smooth-transition">{usage.thisWeek}</div>
                  <div className="text-sm font-medium text-muted-foreground">This Week</div>
                </Card>
                <Card className="glass-effect border border-primary/20 hover-lift p-6 text-center group">
                  <div className="text-5xl font-bold text-primary mb-2 group-hover:scale-110 smooth-transition">{usage.thisMonth}</div>
                  <div className="text-sm font-medium text-muted-foreground">This Month</div>
                </Card>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Pricing Section */}
      <section className="section-padding bg-gradient-to-b from-background to-muted/10">
        <div className="container">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium glass-effect border border-primary/20 shadow-lg">
              <Crown className="w-4 h-4 mr-2" />
              Simple, Transparent Pricing
            </Badge>
            
            <h2 className="text-5xl md:text-6xl font-display font-bold mb-8 leading-none">
              <span className="gradient-text">Choose Your Plan</span>
            </h2>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-4 max-w-3xl mx-auto leading-relaxed">
              Start with a free trial, then pick the plan that fits your needs. 
              <span className="text-foreground font-semibold"> No hidden fees, cancel anytime.</span>
            </p>
          </div>

          <PricingCards />
        </div>
      </section>

      {/* FAQ Section */}
      <section className="section-padding">
        <div className="container">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
              <Star className="w-4 h-4 mr-2" />
              Frequently Asked Questions
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
              Everything You <span className="gradient-text">Need to Know</span>
            </h2>
          </div>
          
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`}
                  className="border-0"
                >
                  <Card className="neomorphic border-0 overflow-hidden">
                    <AccordionTrigger 
                      className="px-6 py-4 hover:no-underline hover:bg-primary/5 smooth-transition"
                      data-testid={`faq-question-${index}`}
                    >
                      <span className="text-lg font-semibold text-left">{faq.question}</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-4">
                      <p className="text-muted-foreground leading-relaxed" data-testid={`faq-answer-${index}`}>
                        {faq.answer}
                      </p>
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding">
        <div className="container">
          <Card className="neomorphic border-0 p-12 md:p-16 text-center relative overflow-hidden max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10" />
            <div className="absolute top-10 right-10 w-32 h-32 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-10 left-10 w-40 h-40 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl" />
            
            <div className="relative z-10">
              <Badge variant="secondary" className="mb-6 glass-effect border border-primary/20 shadow-lg">
                <Rocket className="w-4 h-4 mr-2" />
                Ready to Transform Your Social Media?
              </Badge>
              
              <h2 className="text-4xl md:text-6xl font-display font-bold mb-6">
                Start Creating <span className="gradient-text">Amazing Replies</span>
              </h2>
              
              <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                Join professionals who are already boosting their engagement with AI-powered responses.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-8">
                <Button 
                  size="lg"
                  asChild
                  className="h-16 px-10 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift pulse-glow border-0 font-semibold"
                  data-testid="button-final-cta"
                >
                  <Link href="/app">
                    <Sparkles className="w-6 h-6 mr-3" />
                    Open Web App
                    <ArrowRight className="w-6 h-6 ml-3" />
                  </Link>
                </Button>
              </div>

              <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
                <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <Shield className="w-4 h-4 text-primary" />
                  <span>Secure & Private</span>
                </div>
                <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span>Cancel Anytime</span>
                </div>
                <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span>AI-Powered</span>
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
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <span className="font-display font-bold text-lg">TweetReply</span>
            </div>
            <p className="text-muted-foreground">
              © 2024 TweetReply. All rights reserved. Powered by advanced AI technology.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
