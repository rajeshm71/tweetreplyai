import { Link } from "wouter";
import { MessageCircle, Download, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">TweetReply</span>
          </div>
          <Button 
            variant="ghost" 
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-signin"
          >
            Sign in
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
          <span className="gradient-text">Reply smarter,</span><br />
          <span className="text-foreground">not harder.</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Generate authentic, human-like replies to X (Twitter) posts with one click. 
          Stay consistent with engagement without the time investment.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Button 
            size="lg"
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-start-trial"
          >
            Start Free Trial
          </Button>
          <Button 
            variant="secondary" 
            size="lg"
            asChild
          >
            <Link href="/pricing" data-testid="link-pricing">See Pricing</Link>
          </Button>
        </div>

        {/* How It Works */}
        <div className="grid md:grid-cols-3 gap-8 mb-20">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Download className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Install Extension</h3>
            <p className="text-muted-foreground text-sm">
              Add our Chrome extension or use our mobile-friendly web app
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Paste or Click</h3>
            <p className="text-muted-foreground text-sm">
              Paste a tweet URL or click "Reply" on X to trigger suggestions
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Get Reply</h3>
            <p className="text-muted-foreground text-sm">
              Receive one authentic, contextual reply ready to post
            </p>
          </div>
        </div>

        {/* Pricing Preview */}
        <div className="bg-muted/50 rounded-xl p-8">
          <h2 className="text-2xl font-semibold mb-6">Simple, Transparent Pricing</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Free Trial</h3>
                <div className="text-2xl font-bold mb-2">10 replies/day</div>
                <div className="text-muted-foreground text-sm mb-4">For 7 days</div>
                <Button variant="secondary" className="w-full" disabled>
                  Auto on signup
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Weekly</h3>
                <div className="text-2xl font-bold mb-2">$2.99</div>
                <div className="text-muted-foreground text-sm mb-4">700 replies/week</div>
                <Button className="w-full" asChild>
                  <Link href="/pricing">Subscribe</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Monthly</h3>
                <div className="text-2xl font-bold mb-2">$9.99</div>
                <div className="text-muted-foreground text-sm mb-4">3,000 replies/month</div>
                <Button className="w-full" asChild>
                  <Link href="/pricing">Subscribe</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-20">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 sm:mb-0">
              <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                <MessageCircle className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="font-medium">TweetReply</span>
            </div>
            <div className="flex space-x-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
