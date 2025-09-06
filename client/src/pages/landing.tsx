import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Zap, Clock, Shield, Star, ArrowRight, CheckCircle, Globe, Rocket, Brain, Users, TrendingUp, MessageCircle } from "lucide-react";

export default function Landing() {
  const features = [
    {
      icon: <Brain className="w-6 h-6" />,
      title: "AI-Powered Intelligence",
      description: "Advanced GPT models understand context and generate authentic, human-like replies that feel natural.",
      color: "from-blue-500 to-purple-600"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Lightning Fast",
      description: "Get high-quality replies in under 2 seconds with our optimized AI pipeline and smart routing.",
      color: "from-orange-500 to-red-500"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Privacy Focused",
      description: "Your data stays secure with enterprise-grade encryption and transparent privacy policies.",
      color: "from-green-500 to-emerald-600"
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: "Chrome Extension",
      description: "Reply directly on Twitter/X with our seamless browser extension for effortless engagement.",
      color: "from-cyan-500 to-blue-600"
    }
  ];

  const stats = [
    { value: "50K+", label: "Replies Generated", icon: <Sparkles className="w-4 h-4" /> },
    { value: "99.9%", label: "Uptime", icon: <Zap className="w-4 h-4" /> },
    { value: "<2s", label: "Response Time", icon: <Clock className="w-4 h-4" /> },
    { value: "5★", label: "User Rating", icon: <Star className="w-4 h-4" /> }
  ];

  const benefits = [
    "Boost engagement by 300% with authentic replies",
    "Save 2+ hours daily on social media management", 
    "Maintain consistent brand voice across platforms",
    "Never miss important conversations again"
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass-effect border-b border-border/30">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">TweetReply</span>
          </div>
          
          <div className="flex items-center space-x-6">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <Button 
              onClick={() => window.location.href = '/api/login'}
              className="bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              data-testid="button-signin"
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="hero-gradient">
          <div className="container relative">
            {/* Floating Elements */}
            <div className="absolute top-20 left-10 w-20 h-20 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-2xl animate-pulse" />
            <div className="absolute top-40 right-20 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
            
            <div className="text-center max-w-4xl mx-auto relative z-10">
              <Badge variant="secondary" className="mb-8 px-4 py-2 text-sm font-medium border border-primary/20 bg-white/80">
                <Rocket className="w-4 h-4 mr-2" />
                Powered by GPT-5 Technology
              </Badge>
              
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-tight">
                Generate Perfect
                <br />
                <span className="gradient-text">Twitter Replies</span>
                <br />
                Instantly
              </h1>
              
              <p className="text-xl sm:text-2xl text-muted-foreground mb-12 leading-relaxed max-w-3xl mx-auto">
                Transform your social media engagement with AI that creates authentic, 
                contextual replies in seconds. <span className="text-foreground font-semibold">No more writer's block.</span>
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                <Button 
                  size="lg"
                  onClick={() => window.location.href = '/api/login'}
                  className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-purple-600 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 font-semibold"
                  data-testid="button-start-trial"
                >
                  <Sparkles className="w-5 h-5 mr-3" />
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-3" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="h-14 px-8 text-lg border-2 hover:bg-muted/50 transition-all duration-300"
                >
                  Watch Demo
                </Button>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
                {stats.map((stat, index) => (
                  <Card key={index} className="bg-white/60 backdrop-blur-sm border border-border/50 hover:shadow-lg transition-all duration-300 hover:scale-105">
                    <CardContent className="p-6 text-center">
                      <div className="flex items-center justify-center mb-2 text-primary">
                        {stat.icon}
                      </div>
                      <div className="text-2xl font-bold text-foreground mb-1">{stat.value}</div>
                      <div className="text-sm text-muted-foreground">{stat.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-gradient-to-b from-muted/30 to-background">
        <div className="container">
          <div className="text-center mb-20">
            <Badge variant="secondary" className="mb-4 bg-white/80 border border-primary/20">
              <Star className="w-4 h-4 mr-2" />
              Why Choose TweetReply
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-bold mb-6">
              Powerful Features for <span className="gradient-text">Modern Creators</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need to elevate your social media presence with intelligent, authentic engagement.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {features.map((feature, index) => (
              <Card key={index} className="group bg-white/80 backdrop-blur-sm border border-border/50 hover:shadow-xl transition-all duration-500 hover:scale-105">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className={`flex-shrink-0 p-3 rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      {feature.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-3 text-foreground">{feature.title}</h3>
                      <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
            <div>
              <Badge variant="secondary" className="mb-4 bg-white/80 border border-primary/20">
                <TrendingUp className="w-4 h-4 mr-2" />
                Proven Results
              </Badge>
              <h2 className="text-4xl font-bold mb-8">
                <span className="gradient-text">Transform</span> Your Social Media Strategy
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Join thousands of creators, marketers, and businesses who have revolutionized their 
                social media engagement with our AI-powered platform.
              </p>
              
              <div className="space-y-4 mb-8">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-foreground font-medium">{benefit}</span>
                  </div>
                ))}
              </div>
              
              <Button 
                size="lg"
                onClick={() => window.location.href = '/api/login'}
                className="h-12 px-6 bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                Start Your Journey
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            
            <div className="relative">
              <Card className="bg-white/90 backdrop-blur-sm border border-border/50 shadow-2xl p-8">
                <div className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">Sarah Chen</div>
                      <div className="text-sm text-muted-foreground">Marketing Director @ TechCorp</div>
                    </div>
                  </div>
                  <blockquote className="text-lg text-foreground leading-relaxed">
                    "TweetReply completely transformed our social media strategy. We've seen a 300% increase 
                    in engagement and save hours every week. The AI responses are so natural, our audience 
                    can't tell the difference!"
                  </blockquote>
                  <div className="flex space-x-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-b from-muted/30 to-background">
        <div className="container">
          <Card className="max-w-4xl mx-auto bg-white/90 backdrop-blur-sm border border-border/50 shadow-2xl p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5" />
            <div className="relative z-10">
              <h2 className="text-4xl sm:text-5xl font-bold mb-6">
                Ready to <span className="gradient-text">Revolutionize</span> Your Engagement?
              </h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of creators who are already using TweetReply to build stronger 
                connections and grow their audience authentically.
              </p>
              <Button 
                size="lg"
                onClick={() => window.location.href = '/api/login'}
                className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-purple-600 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 font-semibold"
              >
                <Sparkles className="w-5 h-5 mr-3" />
                Start Your Free Trial
                <ArrowRight className="w-5 h-5 ml-3" />
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                No credit card required • 7-day free trial • Cancel anytime
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12">
        <div className="container">
          <div className="flex flex-col sm:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-6 sm:mb-0">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">TweetReply</span>
            </div>
            <div className="flex space-x-8 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-foreground transition-colors">Contact Us</a>
            </div>
          </div>
          <div className="text-center mt-8 pt-8 border-t border-border/50">
            <p className="text-muted-foreground">
              © 2024 TweetReply. All rights reserved. Built with ❤️ for creators and marketers.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}