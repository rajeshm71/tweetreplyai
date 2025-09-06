import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, ExternalLink, Download, LogOut, Sparkles, Zap, TrendingUp, ArrowRight, Star, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  const achievements = [
    "Generate unlimited authentic replies",
    "Access to premium AI models",
    "Chrome extension included",
    "Priority customer support",
    "Advanced analytics dashboard"
  ];

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
            <UsageBadge />
            <Button variant="ghost" asChild className="smooth-transition hover-scale">
              <Link href="/pricing" data-testid="link-pricing">Pricing</Link>
            </Button>
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

      {/* Welcome Section */}
      <section className="relative overflow-hidden">
        <div className="hero-gradient grid-pattern">
          <div className="container section-padding relative">
            {/* Floating Elements */}
            <div className="absolute top-10 right-10 w-16 h-16 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-lg floating-animation" />
            <div className="absolute bottom-10 left-10 w-20 h-20 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-xl floating-animation" style={{ animationDelay: '-3s' }} />
            
            <div className="text-center mb-20 relative z-10">
              <Badge variant="secondary" className="mb-4 px-4 py-2 text-sm font-medium glass-effect border border-primary/20">
                <Star className="w-4 h-4 mr-2" />
                {(user as any)?.firstName ? `Welcome back, ${(user as any).firstName}!` : 'Welcome back!'}
              </Badge>
              <h1 className="text-5xl md:text-7xl font-display font-bold mb-8 leading-none">
                <span className="gradient-text">Generate Amazing</span>
                <br />
                <span className="text-foreground">Replies Now</span>
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
                Ready to create some authentic, engaging replies? 
                <span className="text-foreground font-semibold"> Choose how you'd like to get started.</span>
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto relative z-10">
              <Card className="neomorphic border-0 hover-lift group overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 smooth-transition" />
                <CardContent className="p-10 text-center relative z-10">
                  <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl group-hover:scale-110 smooth-transition">
                    <MessageCircle className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-display font-semibold mb-4 text-foreground">Web Application</h3>
                  <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                    Paste any tweet text or URL and get instant, authentic reply suggestions using advanced AI
                  </p>
                  <Button 
                    asChild 
                    className="w-full h-12 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift hover-glow border-0 font-semibold"
                    data-testid="link-web-app"
                  >
                    <Link href="/app">
                      <Sparkles className="w-5 h-5 mr-3" />
                      Open Web App
                      <ArrowRight className="w-5 h-5 ml-3" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="neomorphic border-0 hover-lift group overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 smooth-transition" />
                <CardContent className="p-10 text-center relative z-10">
                  <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl group-hover:scale-110 smooth-transition">
                    <Download className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-display font-semibold mb-4 text-foreground">Chrome Extension</h3>
                  <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                    Install our extension for seamless X (Twitter) integration and reply directly on posts
                  </p>
                  <Button 
                    variant="outline" 
                    asChild 
                    className="w-full h-12 text-lg glass-effect border-primary/30 hover:bg-primary/10 smooth-transition font-semibold"
                  >
                    <a href="/extension.zip" download data-testid="button-download-extension">
                      <Download className="w-5 h-5 mr-3" />
                      Download Extension
                      <ExternalLink className="w-5 h-5 ml-3" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Usage Stats */}
      <section className="section-padding bg-gradient-to-b from-background to-muted/10">
        <div className="container">
          {usage && (
            <Card className="max-w-4xl mx-auto neomorphic border-0 mb-16">
              <CardContent className="p-12">
                <div className="text-center mb-12">
                  <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Your Analytics
                  </Badge>
                  <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Usage Dashboard</h2>
                  <p className="text-lg text-muted-foreground">Track your reply generation activity and engagement growth</p>
                </div>
                
                <div className="grid grid-cols-3 gap-8 text-center">
                  <div className="group">
                    <Card className="glass-effect border border-primary/20 hover-lift p-6">
                      <div className="text-4xl font-bold text-primary mb-2 group-hover:scale-110 smooth-transition">{usage.today}</div>
                      <div className="text-sm font-medium text-muted-foreground">Today</div>
                    </Card>
                  </div>
                  <div className="group">
                    <Card className="glass-effect border border-primary/20 hover-lift p-6">
                      <div className="text-4xl font-bold text-primary mb-2 group-hover:scale-110 smooth-transition">{usage.thisWeek}</div>
                      <div className="text-sm font-medium text-muted-foreground">This Week</div>
                    </Card>
                  </div>
                  <div className="group">
                    <Card className="glass-effect border border-primary/20 hover-lift p-6">
                      <div className="text-4xl font-bold text-primary mb-2 group-hover:scale-110 smooth-transition">{usage.thisMonth}</div>
                      <div className="text-sm font-medium text-muted-foreground">This Month</div>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Premium Features */}
          <Card className="neomorphic border-0 p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5" />
            <div className="relative z-10">
              <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
                <Star className="w-4 h-4 mr-2" />
                Premium Member
              </Badge>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">
                You're All Set for <span className="gradient-text">Success</span>!
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Your TweetReply account is ready to transform your social media engagement with powerful AI technology.
              </p>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
                {achievements.map((achievement, index) => (
                  <div key={index} className="flex items-center space-x-3 text-left">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-foreground font-medium">{achievement}</span>
                  </div>
                ))}
              </div>
              
              <Button 
                asChild
                size="lg"
                className="h-12 px-6 bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg hover-lift border-0"
              >
                <Link href="/app">
                  Start Generating Replies
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}