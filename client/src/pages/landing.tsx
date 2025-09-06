import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Zap, Clock, Shield, Star, ArrowRight, CheckCircle, Globe, Rocket, Brain, Users, TrendingUp } from "lucide-react";

export default function Landing() {
  const features = [
    {
      icon: <Brain className="w-8 h-8" />,
      title: "AI-Powered Replies",
      description: "Generate authentic, contextual responses using advanced GPT models that understand nuance and tone.",
      gradient: "from-purple-500/20 to-pink-500/20"
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Lightning Fast",
      description: "Get high-quality replies in seconds with our optimized AI pipeline and intelligent model routing.",
      gradient: "from-yellow-500/20 to-orange-500/20"
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Privacy First",
      description: "Your data stays secure with enterprise-grade encryption and transparent privacy policies.",
      gradient: "from-green-500/20 to-emerald-500/20"
    },
    {
      icon: <Globe className="w-8 h-8" />,
      title: "Chrome Extension",
      description: "Reply directly on Twitter/X with our seamless browser extension for effortless engagement.",
      gradient: "from-blue-500/20 to-cyan-500/20"
    }
  ];

  const stats = [
    { value: "50K+", label: "Replies Generated", icon: <Sparkles className="w-5 h-5" /> },
    { value: "99.9%", label: "Uptime", icon: <Zap className="w-5 h-5" /> },
    { value: "<2s", label: "Response Time", icon: <Clock className="w-5 h-5" /> },
    { value: "5★", label: "User Rating", icon: <Star className="w-5 h-5" /> }
  ];

  const benefits = [
    "Boost engagement by 300% with authentic replies",
    "Save 2+ hours daily on social media management",
    "Maintain consistent brand voice across platforms",
    "Never miss important conversations again",
    "Scale your social presence effortlessly"
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
            <Button variant="ghost" className="smooth-transition hover-scale">
              Features
            </Button>
            <Button variant="ghost" className="smooth-transition hover-scale">
              Pricing
            </Button>
            <Button 
              onClick={() => window.location.href = '/api/login'}
              className="bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg hover-lift pulse-glow border-0"
              data-testid="button-signin"
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
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
            <div className="absolute bottom-20 left-1/4 w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-lg floating-animation" style={{ animationDelay: '-4s' }} />
            
            <div className="text-center max-w-5xl mx-auto relative z-10">
              {/* Badge */}
              <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium glass-effect border border-primary/20">
                <Rocket className="w-4 h-4 mr-2" />
                Powered by GPT-5 AI Technology
              </Badge>
              
              {/* Main Headline */}
              <h1 className="text-6xl md:text-8xl font-display font-bold mb-8 leading-none">
                <span className="gradient-text">Generate</span>
                <br />
                <span className="text-foreground">Perfect Replies</span>
                <br />
                <span className="gradient-text-accent">Instantly</span>
              </h1>
              
              {/* Subheadline */}
              <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
                Transform your social media engagement with AI-powered replies that sound authentically human. 
                <span className="text-foreground font-semibold"> Generate contextual responses in seconds.</span>
              </p>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                <Button 
                  size="lg"
                  onClick={() => window.location.href = '/api/login'}
                  className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift hover-glow border-0 font-semibold"
                  data-testid="button-start-trial"
                >
                  <Sparkles className="w-5 h-5 mr-3" />
                  Start Generating Replies
                  <ArrowRight className="w-5 h-5 ml-3" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="h-14 px-8 text-lg glass-effect border-primary/30 hover:bg-primary/10 smooth-transition"
                >
                  Watch Demo
                </Button>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
                {stats.map((stat, index) => (
                  <Card key={index} className="glass-effect border border-primary/20 hover-lift">
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
      <section className="section-padding">
        <div className="container">
          <div className="text-center mb-20">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
              <Star className="w-4 h-4 mr-2" />
              Premium Features
            </Badge>
            <h2 className="text-4xl md:text-6xl font-display font-bold mb-6">
              Why Choose <span className="gradient-text">TweetReply</span>?
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Experience the next generation of social media automation with our cutting-edge AI technology and intuitive design.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <Card key={index} className={`neomorphic border-0 hover-lift group overflow-hidden relative`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 smooth-transition`} />
                <CardContent className="p-8 relative z-10">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary group-hover:scale-110 smooth-transition">
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
      <section className="section-padding bg-gradient-to-b from-background to-muted/20">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
                <TrendingUp className="w-4 h-4 mr-2" />
                Proven Results
              </Badge>
              <h2 className="text-4xl md:text-5xl font-display font-bold mb-8">
                <span className="gradient-text">Supercharge</span> Your Social Media Presence
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Join thousands of professionals who have transformed their social media strategy with our AI-powered reply generation platform.
              </p>
              
              <div className="space-y-4 mb-8">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="w-6 h-6 text-primary flex-shrink-0" />
                    <span className="text-foreground font-medium">{benefit}</span>
                  </div>
                ))}
              </div>
              
              <Button 
                size="lg"
                onClick={() => window.location.href = '/api/login'}
                className="h-12 px-6 bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg hover-lift border-0"
              >
                Get Started Today
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            
            <div className="relative">
              <Card className="neomorphic border-0 p-8">
                <div className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">Sarah Chen</div>
                      <div className="text-sm text-muted-foreground">Marketing Director</div>
                    </div>
                  </div>
                  <blockquote className="text-lg text-foreground leading-relaxed">
                    "TweetReply has completely transformed how we engage on social media. Our response time improved by 90% and engagement rates are through the roof!"
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
      <section className="section-padding">
        <div className="container">
          <Card className="neomorphic border-0 p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10" />
            <div className="relative z-10">
              <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
                Ready to <span className="gradient-text">Transform</span> Your Social Media?
              </h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of professionals who are already using TweetReply to boost their social media engagement.
              </p>
              <Button 
                size="lg"
                onClick={() => window.location.href = '/api/login'}
                className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift pulse-glow border-0 font-semibold"
              >
                <Sparkles className="w-5 h-5 mr-3" />
                Start Your Free Trial
                <ArrowRight className="w-5 h-5 ml-3" />
              </Button>
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
              © 2024 TweetReply. All rights reserved. Powered by advanced AI technology.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}