import { Link } from "wouter";
import { MessageCircle, Download, FileText, Sparkles, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="w-full py-6">
        <div className="container flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <MessageCircle className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">TweetReply</span>
          </div>
          <Button 
            variant="ghost" 
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-signin"
            className="smooth-transition hover:bg-muted/50"
          >
            Sign in
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative section-padding">
        <div className="absolute inset-0 hero-gradient pointer-events-none" />
        <div className="container text-center relative">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-[1.1]">
              <span className="gradient-text floating-animation">Reply smarter,</span><br />
              <span className="text-foreground">not harder.</span>
            </h1>
            <p className="text-xl sm:text-2xl text-muted-foreground mb-12 content-max leading-relaxed">
              Generate authentic, human-like replies to X (Twitter) posts with one click. 
              Stay consistent with engagement without the time investment.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
              <Button 
                size="lg"
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-start-trial"
                className="h-14 px-8 text-lg smooth-transition shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02]"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                variant="secondary" 
                size="lg"
                asChild
                className="h-14 px-8 text-lg smooth-transition hover:bg-secondary/80"
              >
                <Link href="/pricing" data-testid="link-pricing">See Pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section-padding bg-muted/20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How it works</h2>
            <p className="text-lg text-muted-foreground content-max">Three simple steps to authentic engagement</p>
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center group">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/25 group-hover:shadow-xl group-hover:shadow-primary/30 smooth-transition group-hover:scale-105">
                <Download className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Install Extension</h3>
              <p className="text-muted-foreground leading-relaxed">
                Add our Chrome extension or use our mobile-friendly web app
              </p>
            </div>
            <div className="text-center group">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/25 group-hover:shadow-xl group-hover:shadow-primary/30 smooth-transition group-hover:scale-105">
                <FileText className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Paste or Click</h3>
              <p className="text-muted-foreground leading-relaxed">
                Paste a tweet URL or click "Reply" on X to trigger suggestions
              </p>
            </div>
            <div className="text-center group">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/25 group-hover:shadow-xl group-hover:shadow-primary/30 smooth-transition group-hover:scale-105">
                <Sparkles className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Get Reply</h3>
              <p className="text-muted-foreground leading-relaxed">
                Receive one authentic, contextual reply ready to post
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="section-padding">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-lg text-muted-foreground content-max">Start free, scale as you grow</p>
          </div>
          <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="border-2 smooth-transition hover:shadow-lg hover:border-primary/20">
              <CardContent className="p-8 text-center">
                <h3 className="text-lg font-semibold mb-4">Free Trial</h3>
                <div className="mb-6">
                  <div className="text-3xl font-bold mb-1">10 replies</div>
                  <div className="text-muted-foreground">per day, for 7 days</div>
                </div>
                <ul className="space-y-3 mb-8 text-sm">
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>AI-powered replies</span>
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Web app access</span>
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Chrome extension</span>
                  </li>
                </ul>
                <Button variant="secondary" className="w-full" disabled>
                  Auto on signup
                </Button>
              </CardContent>
            </Card>
            <Card className="border-2 border-primary bg-primary/5 smooth-transition hover:shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 text-xs font-medium rounded-b-lg">
                Most Popular
              </div>
              <CardContent className="p-8 text-center pt-12">
                <h3 className="text-lg font-semibold mb-4">Weekly</h3>
                <div className="mb-6">
                  <div className="text-4xl font-bold mb-1">$2.99</div>
                  <div className="text-muted-foreground">700 replies/week</div>
                </div>
                <ul className="space-y-3 mb-8 text-sm">
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Everything in trial</span>
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Advanced analytics</span>
                  </li>
                </ul>
                <Button className="w-full shadow-lg" asChild>
                  <Link href="/pricing">Get Started</Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="border-2 smooth-transition hover:shadow-lg hover:border-primary/20">
              <CardContent className="p-8 text-center">
                <h3 className="text-lg font-semibold mb-4">Monthly</h3>
                <div className="mb-6">
                  <div className="text-3xl font-bold mb-1">$9.99</div>
                  <div className="text-muted-foreground">3,000 replies/month</div>
                </div>
                <ul className="space-y-3 mb-8 text-sm">
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Everything in weekly</span>
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Best value</span>
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Team features</span>
                  </li>
                </ul>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/pricing">Get Started</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/20">
        <div className="container py-12">
          <div className="flex flex-col sm:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-6 sm:mb-0">
              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-sm">
                <MessageCircle className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg tracking-tight">TweetReply</span>
            </div>
            <div className="flex space-x-8 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground smooth-transition">Privacy</a>
              <a href="#" className="hover:text-foreground smooth-transition">Terms</a>
              <a href="#" className="hover:text-foreground smooth-transition">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
