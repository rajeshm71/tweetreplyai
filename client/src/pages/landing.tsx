import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PricingCards } from "@/components/pricing-cards";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Zap, ArrowRight, CheckCircle, Rocket, Brain, MessageCircle, Download, Crown, Star, Shield, ChevronRight, TrendingUp, Chrome, Heart, Users, Building2, Award } from "lucide-react";
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useCallback, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [activeUsers, setActiveUsers] = useState(0);
  
  useEffect(() => {
    const target = 5000;
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setActiveUsers(target);
        clearInterval(timer);
      } else {
        setActiveUsers(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, []);

  const exampleReplies = [
    {
      username: "@elonmusk",
      tweet: "Thinking about building XPhone.",
      reply: "If it comes with a Dogecoin wallet, I'm in 😂"
    },
    {
      username: "@ProductHunt",
      tweet: "What's the best productivity tool you've discovered this year?",
      reply: "TweetReply ironically! Saves me hours crafting authentic replies daily 🚀"
    },
    {
      username: "@TechCrunch",
      tweet: "AI is changing how we work. Thoughts?",
      reply: "Game changer for engagement! AI handles the replies, we focus on strategy ⚡"
    },
    {
      username: "@ycombinator",
      tweet: "Just launched our startup! Any advice for first-time founders?",
      reply: "Congrats! Build in public, engage authentically, and ship fast. You've got this! 🎉"
    }
  ];

  const testimonials = [
    {
      quote: "TweetReply completely transformed our social media strategy. We've seen a 300% increase in engagement and save hours every week. The AI responses are so natural!",
      author: "Sarah Chen",
      role: "Marketing Director @ TechCorp"
    },
    {
      quote: "As a solo founder, TweetReply helps me maintain authentic connections without spending all day on social media. It's like having a social media manager in my pocket!",
      author: "Michael Rodriguez",
      role: "Founder @ StartupLabs"
    },
    {
      quote: "The quality of replies is incredible. Our community engagement has tripled, and people can't tell it's AI-assisted. Game changer for content creators!",
      author: "Emily Watson",
      role: "Content Creator & Influencer"
    }
  ];

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 4000, stopOnInteraction: false })]);
  const [testimonialEmblaRef, testimonialEmblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 5000, stopOnInteraction: false })]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const [demoTweet, setDemoTweet] = useState("");
  const [demoReply, setDemoReply] = useState("");

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  const onTestimonialSelect = useCallback(() => {
    if (!testimonialEmblaApi) return;
    setTestimonialIndex(testimonialEmblaApi.selectedScrollSnap());
  }, [testimonialEmblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!testimonialEmblaApi) return;
    onTestimonialSelect();
    testimonialEmblaApi.on('select', onTestimonialSelect);
    return () => {
      testimonialEmblaApi.off('select', onTestimonialSelect);
    };
  }, [testimonialEmblaApi, onTestimonialSelect]);

  const generateDemoReply = (tweet: string) => {
    if (!tweet.trim()) {
      setDemoReply("");
      return;
    }
    
    const demoReplies = [
      "That's a great perspective! I totally agree 💯",
      "Interesting take! Have you considered the impact on... 🤔",
      "This is exactly what I've been thinking about lately!",
      "Love this! More people need to hear about it 🚀",
      "Thanks for sharing! This really resonated with me ✨"
    ];
    
    setTimeout(() => {
      const randomReply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
      setDemoReply(randomReply);
    }, 800);
  };

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
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-bold text-xl">TweetReply</span>
            </div>
            
            <Button 
              onClick={() => {
                if (isAuthenticated) {
                  window.open('https://chrome.google.com/webstore', '_blank');
                } else {
                  window.location.href = '/login';
                }
              }}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover-lift border-0 font-medium shadow-md"
              data-testid="button-add-to-chrome"
              size="sm"
            >
              <Chrome className="w-4 h-4 mr-2" />
              Add to Chrome
            </Button>
          </div>
          
          <div className="flex items-center space-x-6">
            <a href="#features" className="text-muted-foreground hover:text-foreground smooth-transition text-sm font-medium hidden md:block">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground smooth-transition text-sm font-medium hidden md:block">Pricing</a>
            <Button 
              onClick={() => window.location.href = '/login'}
              className="bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg hover-lift border-0 font-semibold"
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
            <div className="absolute top-10 right-10 w-24 h-24 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-2xl floating-animation" />
            <div className="absolute bottom-10 left-10 w-32 h-32 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl floating-animation" style={{ animationDelay: '-3s' }} />
            <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-full blur-2xl floating-animation" style={{ animationDelay: '-5s' }} />
            
            <div className="text-center mb-16 relative z-10">
              <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium glass-effect border border-primary/20 shadow-lg">
                <Rocket className="w-4 h-4 mr-2" />
                Powered by Advanced AI
              </Badge>
              
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold mb-8 leading-none">
                <span className="gradient-text">Generate Perfect</span>
                <br />
                <span className="text-foreground">Twitter Replies</span>
                <br />
                <span className="text-foreground">Instantly</span>
              </h1>
              
              <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
                Transform your social media engagement with AI that creates authentic, 
                contextual replies in seconds. <span className="text-foreground font-semibold">No more writer's block.</span>
              </p>

              <div className="flex items-center justify-center gap-2 mb-12">
                <Users className="w-5 h-5 text-primary" />
                <span className="text-lg font-semibold">
                  <span className="text-primary gradient-text text-2xl font-bold">{activeUsers.toLocaleString()}+</span>
                  <span className="text-muted-foreground ml-2">Active Users</span>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                <Button 
                  size="lg"
                  onClick={() => window.location.href = '/login'}
                  className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift pulse-glow border-0 font-semibold"
                  data-testid="button-start-trial"
                >
                  <Sparkles className="w-5 h-5 mr-3" />
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-3" />
                </Button>
                
                <div className="flex items-center space-x-3 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span>No credit card required</span>
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span>7-day trial</span>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                <Card className="glass-effect border border-primary/20 p-4 hover-lift">
                  <div className="text-3xl font-bold text-primary mb-1">50K+</div>
                  <div className="text-sm text-muted-foreground">Replies Generated</div>
                </Card>
                <Card className="glass-effect border border-primary/20 p-4 hover-lift">
                  <div className="text-3xl font-bold text-primary mb-1">99.9%</div>
                  <div className="text-sm text-muted-foreground">Uptime</div>
                </Card>
                <Card className="glass-effect border border-primary/20 p-4 hover-lift">
                  <div className="text-3xl font-bold text-primary mb-1">&lt;2s</div>
                  <div className="text-sm text-muted-foreground">Response Time</div>
                </Card>
                <Card className="glass-effect border border-primary/20 p-4 hover-lift">
                  <div className="text-3xl font-bold text-primary mb-1">5★</div>
                  <div className="text-sm text-muted-foreground">User Rating</div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Example Replies Carousel */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="section-padding bg-gradient-to-b from-background to-muted/5"
      >
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex">
                {exampleReplies.map((example, index) => (
                  <div key={index} className="flex-[0_0_100%] min-w-0 px-4">
                    <Card className="neomorphic border-0 p-8 max-w-2xl mx-auto">
                      <div className="space-y-4">
                        <div className="flex gap-3 justify-end">
                          <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-muted/50">
                            <div className="text-xs text-muted-foreground mb-1">{example.username}</div>
                            <p className="text-sm">{example.tweet}</p>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <MessageCircle className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-primary/10">
                            <div className="text-xs text-primary mb-1">TweetReply AI</div>
                            <p className="text-sm">{example.reply}</p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center gap-2 mt-6">
              {exampleReplies.map((_, index) => (
                <button
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === selectedIndex ? 'bg-primary w-8' : 'bg-muted-foreground/30'
                  }`}
                  onClick={() => emblaApi?.scrollTo(index)}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>

        </div>
      </motion.section>

      {/* Trusted By Section */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="section-padding bg-background"
      >
        <div className="container">
          <p className="text-center text-sm text-muted-foreground mb-8 font-medium">Trusted by teams at</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto items-center opacity-60">
            <div className="flex items-center justify-center gap-2">
              <Building2 className="w-5 h-5" />
              <span className="font-semibold text-lg">TechCorp</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Building2 className="w-5 h-5" />
              <span className="font-semibold text-lg">StartupLabs</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Building2 className="w-5 h-5" />
              <span className="font-semibold text-lg">GrowthHub</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Building2 className="w-5 h-5" />
              <span className="font-semibold text-lg">MediaFlow</span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* As Seen On Section */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        viewport={{ once: true }}
        className="section-padding bg-muted/5"
      >
        <div className="container">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
              <Award className="w-4 h-4 mr-2" />
              Recognition
            </Badge>
            <h2 className="text-3xl md:text-4xl font-display font-bold">
              Featured <span className="gradient-text">In The Press</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <Card className="neomorphic border-0 p-6 text-center hover-lift">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Star className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">Product Hunt</p>
              <p className="text-sm text-muted-foreground">#1 Product of the Day</p>
            </Card>
            <Card className="neomorphic border-0 p-6 text-center hover-lift">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">TechCrunch</p>
              <p className="text-sm text-muted-foreground">Featured Startup</p>
            </Card>
            <Card className="neomorphic border-0 p-6 text-center hover-lift">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">VentureBeat</p>
              <p className="text-sm text-muted-foreground">AI Innovation Award</p>
            </Card>
          </div>
        </div>
      </motion.section>

      {/* Product Tour */}
      <section id="features" className="section-padding bg-gradient-to-b from-muted/5 to-muted/10">
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
                <div className="flex items-center justify-center text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 mr-2 text-primary" />
                  <span>Mobile-friendly design</span>
                </div>
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
                <div className="flex items-center justify-center text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 mr-2 text-primary" />
                  <span>One-click integration</span>
                </div>
              </CardContent>
            </Card>

            {/* Natural Contextual Replies */}
            <Card className="neomorphic border-0 hover-lift group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10 opacity-0 group-hover:opacity-100 smooth-transition" />
              <CardContent className="p-8 text-center relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl group-hover:scale-110 group-hover:rotate-3 smooth-transition">
                  <Heart className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-display font-semibold mb-3 text-foreground">Natural, Human-like Replies</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Understands tone, humor, and context to make every reply sound authentically you
                </p>
                <div className="flex items-center justify-center text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 mr-2 text-primary" />
                  <span>Contextual & authentic</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Interactive Live Demo */}
      <motion.section 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7 }}
        viewport={{ once: true }}
        className="section-padding bg-background"
      >
        <div className="container">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
              <Brain className="w-4 h-4 mr-2" />
              Try It Live
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
              See <span className="gradient-text">AI Magic</span> in Action
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Type any tweet below and watch TweetReply generate a perfect response instantly
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Card className="neomorphic border-0 p-8">
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium mb-2 block">Enter a Tweet</label>
                  <textarea
                    className="w-full p-4 rounded-xl border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 smooth-transition"
                    placeholder="Example: Just launched our new AI-powered app! What do you think?"
                    rows={3}
                    value={demoTweet}
                    onChange={(e) => {
                      setDemoTweet(e.target.value);
                      generateDemoReply(e.target.value);
                    }}
                    data-testid="input-demo-tweet"
                  />
                </div>

                {demoReply && (
                  <div className="bg-primary/5 rounded-xl p-6 border border-primary/20 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-xs text-primary mb-1 font-semibold">TweetReply AI Generated</div>
                        <p className="text-foreground">{demoReply}</p>
                      </div>
                    </div>
                  </div>
                )}

                {!demoReply && demoTweet && (
                  <div className="bg-muted/30 rounded-xl p-6 border border-border/50">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                      <span className="text-sm text-muted-foreground">Generating reply...</span>
                    </div>
                  </div>
                )}

                {!demoTweet && (
                  <div className="text-center text-sm text-muted-foreground">
                    <Sparkles className="w-4 h-4 inline mr-2" />
                    Start typing to see AI-generated replies appear instantly
                  </div>
                )}
              </div>
            </Card>

            <div className="text-center mt-8">
              <Button
                onClick={() => window.location.href = '/login'}
                size="lg"
                className="bg-gradient-to-r from-primary to-primary/80 text-white shadow-xl hover-lift border-0 font-semibold"
                data-testid="button-demo-cta"
              >
                Get Full Access Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Before/After Engagement Metrics */}
      <motion.section 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
        className="section-padding bg-gradient-to-b from-muted/10 to-background"
      >
        <div className="container">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
              <TrendingUp className="w-4 h-4 mr-2" />
              Real Results
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
              See The <span className="gradient-text">Engagement Boost</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Average metrics from our 5,000+ active users
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Before */}
            <Card className="neomorphic border-0 p-8 relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-500/20">Before</Badge>
              </div>
              <div className="space-y-6 mt-8">
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Weekly Replies</div>
                  <div className="text-4xl font-bold text-foreground">45</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Time Spent</div>
                  <div className="text-4xl font-bold text-foreground">8 hrs</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Engagement Rate</div>
                  <div className="text-4xl font-bold text-foreground">2.3%</div>
                </div>
              </div>
            </Card>

            {/* After */}
            <Card className="neomorphic border-0 p-8 relative overflow-hidden border-2 border-primary/30">
              <div className="absolute top-4 right-4">
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20">After</Badge>
              </div>
              <div className="space-y-6 mt-8">
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Weekly Replies</div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-4xl font-bold text-primary">320</div>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">+611%</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Time Spent</div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-4xl font-bold text-primary">2 hrs</div>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">-75%</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Engagement Rate</div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-4xl font-bold text-primary">7.9%</div>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">+243%</Badge>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </motion.section>

      {/* Pricing Section */}
      <section id="pricing" className="section-padding bg-gradient-to-b from-background to-muted/10">
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

      {/* Testimonials Carousel */}
      <section className="section-padding">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="overflow-hidden" ref={testimonialEmblaRef}>
              <div className="flex">
                {testimonials.map((testimonial, index) => (
                  <div key={index} className="flex-[0_0_100%] min-w-0">
                    <Card className="neomorphic border-0 p-10 relative overflow-hidden mx-4">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-center mb-6">
                          <div className="flex space-x-1">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className="w-6 h-6 text-yellow-400 fill-current" />
                            ))}
                          </div>
                        </div>
                        <blockquote className="text-xl md:text-2xl text-center text-foreground leading-relaxed mb-6">
                          "{testimonial.quote}"
                        </blockquote>
                        <div className="text-center">
                          <div className="font-semibold text-foreground">{testimonial.author}</div>
                          <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                        </div>
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === testimonialIndex ? 'bg-primary w-8' : 'bg-muted-foreground/30'
                  }`}
                  onClick={() => testimonialEmblaApi?.scrollTo(index)}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="section-padding bg-gradient-to-b from-background to-muted/10">
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
                <Heart className="w-4 h-4 mr-2 text-primary" />
                Join 5,000+ Creators
              </Badge>
              
              <h2 className="text-4xl md:text-6xl font-display font-bold mb-6">
                Let Every Tweet Spark <span className="gradient-text">a Conversation</span> ✨
              </h2>
              
              <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                More than 5,000 creators trust TweetReply to help them stay authentic while scaling their engagement. Your voice, amplified.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-8">
                <Button 
                  size="lg"
                  onClick={() => window.location.href = '/login'}
                  className="h-16 px-10 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift pulse-glow border-0 font-semibold"
                  data-testid="button-final-cta"
                >
                  <Sparkles className="w-6 h-6 mr-3" />
                  Start Free Trial
                  <ArrowRight className="w-6 h-6 ml-3" />
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
