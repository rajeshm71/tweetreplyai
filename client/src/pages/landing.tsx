import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PricingCards } from "@/components/pricing-cards";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Zap, ArrowRight, CheckCircle, Rocket, Brain, MessageCircle, Download, Crown, Star, Shield, ChevronRight, TrendingUp, Chrome, Heart, Users, Menu, X, Copy, Check, Building2, Award } from "lucide-react";
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Constants for better maintainability
const SCROLL_THRESHOLD = 0.5; // Threshold for showing sticky CTA (50% of hero height)
const COPY_SUCCESS_DURATION = 2000; // Duration to show copy success feedback (ms)
const DEMO_REPLY_DELAY = 800; // Delay before showing demo reply (ms)

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [activeUsers, setActiveUsers] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);
  
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
      reply: "TweetReplyAI ironically! Saves me hours crafting authentic replies daily 🚀"
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

  // Auto-cycle through example replies
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentExampleIndex((prev) => (prev + 1) % exampleReplies.length);
    }, 5000); // Change every 5 seconds

    return () => clearInterval(interval);
  }, [exampleReplies.length]);

  const testimonials = [
    {
      quote: "TweetReplyAI completely transformed how I engage on X. I save hours every week and my engagement has skyrocketed. The AI responses feel completely natural!",
      author: "Sarah Chen",
      role: "Marketing Director"
    },
    {
      quote: "As a solo founder, TweetReplyAI helps me maintain authentic connections without spending all day on social media. It's like having a social media manager in my pocket!",
      author: "Michael Rodriguez",
      role: "Startup Founder"
    },
    {
      quote: "The quality of replies is incredible. Our community engagement has tripled, and people can't tell it's AI-assisted. Game changer for content creators!",
      author: "Emily Watson",
      role: "Content Creator"
    }
  ];

  const [testimonialEmblaRef, testimonialEmblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 5000, stopOnInteraction: false })]);
  const [testimonialIndex, setTestimonialIndex] = useState(0);

  const onTestimonialSelect = useCallback(() => {
    if (!testimonialEmblaApi) return;
    setTestimonialIndex(testimonialEmblaApi.selectedScrollSnap());
  }, [testimonialEmblaApi]);

  useEffect(() => {
    if (!testimonialEmblaApi) return;
    onTestimonialSelect();
    testimonialEmblaApi.on('select', onTestimonialSelect);
    return () => {
      testimonialEmblaApi.off('select', onTestimonialSelect);
    };
  }, [testimonialEmblaApi, onTestimonialSelect]);

  const faqs = [
    {
      question: "How do the reply quotas work?",
      answer: "Your quota resets automatically based on your plan. Trial users get 10 replies per day, weekly subscribers get 700 replies every 7 days, and monthly subscribers get 3,000 replies every 30 days.",
      icon: "Zap"
    },
    {
      question: "Can I use both the extension and web app?",
      answer: "Yes! Your subscription covers both the Chrome extension and the mobile-friendly web interface. Your quota is shared across both platforms.",
      icon: "MessageCircle"
    },
    {
      question: "How authentic are the AI-generated replies?",
      answer: "Our AI is trained to generate human-like, contextual replies under 25 words. Most users post our suggestions without any edits. We avoid generic AI clichés and hashtags.",
      icon: "Brain"
    },
    {
      question: "What AI models do you use?",
      answer: "We use the latest GPT and Gemini models, automatically selecting the best model based on tweet complexity for optimal results.",
      icon: "Sparkles"
    },
    {
      question: "Can I cancel anytime?",
      answer: "Absolutely! You can cancel your subscription at any time. Your plan will remain active until the end of your current billing cycle.",
      icon: "Shield"
    },
    {
      question: "Is my data secure?",
      answer: "Yes, we take privacy seriously. Your tweets and replies are processed securely and we never store your personal data. All data transmission is encrypted.",
      icon: "Shield"
    },
    {
      question: "How fast are replies generated?",
      answer: "Our AI typically generates replies in under 2 seconds. The actual time may vary slightly based on tweet complexity and server load.",
      icon: "Zap"
    },
    {
      question: "Can I customize the tone of replies?",
      answer: "Currently, our AI automatically detects the tone and context of the original tweet. We're working on tone customization features for future releases.",
      icon: "MessageCircle"
    }
  ];

  // Handle smooth scroll for anchor links
  // Fixed: Use closest('a') to handle clicks on child elements within anchors
  useEffect(() => {
    const handleSmoothScroll = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Find the closest anchor element (handles clicks on child elements like icons)
      const anchor = target.closest('a[href^="#"]');
      if (anchor) {
        e.preventDefault();
        const href = anchor.getAttribute('href');
        if (href) {
          const element = document.querySelector(href);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    };
    
    document.addEventListener('click', handleSmoothScroll);
    return () => document.removeEventListener('click', handleSmoothScroll);
  }, []);

  // Handle sticky CTA visibility
  // Fixed: Throttled with requestAnimationFrame for performance, uses proper hero section selector,
  // includes error handling
  useEffect(() => {
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          try {
            // Use the hero section with aria-labelledby for accurate selection
            const heroSection = document.querySelector('section[aria-labelledby="hero-heading"]');
            if (!heroSection) return;
            
            const heroHeight = heroSection.offsetHeight || 0;
            setShowStickyCTA(window.scrollY > heroHeight * SCROLL_THRESHOLD);
          } catch (error) {
            console.error('Scroll handler error:', error);
          } finally {
            ticking = false;
          }
        });
        ticking = true;
      }
    };
    
    // Use passive listener for better scroll performance
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation
    
    // Cleanup: remove event listener
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);


  return (
    <div className="min-h-screen bg-background">
      {/* Skip to content link */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      {/* Navigation */}
      <nav 
        className="sticky top-0 z-50 glass-effect border-b border-border/50 backdrop-blur-xl"
        aria-label="Main navigation"
      >
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg" aria-hidden="true">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-bold text-xl">TweetReplyAI</span>
            </div>
            
            <Button 
              onClick={() => {
                window.open('https://chromewebstore.google.com/detail/tweetreply-ai-powered-twi/nhpilcnghmcdhcbhndmemiggfekmdgem', '_blank');
              }}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover-lift border-0 font-medium shadow-md hidden sm:flex"
              data-testid="button-add-to-chrome"
              size="sm"
              aria-label="Add TweetReplyAI to Chrome"
            >
              <Chrome className="w-4 h-4 mr-2" aria-hidden="true" />
              Add to Chrome
            </Button>
          </div>
          
          <div className="flex items-center space-x-6">
            <a 
              href="#features" 
              className="text-muted-foreground hover:text-foreground smooth-transition text-sm font-medium hidden md:block focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              aria-label="Navigate to Features section"
            >
              Features
            </a>
            <a 
              href="#pricing" 
              className="text-muted-foreground hover:text-foreground smooth-transition text-sm font-medium hidden md:block focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              aria-label="Navigate to Pricing section"
            >
              Pricing
            </a>
            <Button 
              onClick={() => window.location.href = '/login'}
              className="bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg hover-lift border-0 font-semibold hidden sm:flex"
              data-testid="button-signin"
              aria-label="Get started with TweetReplyAI"
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
            </Button>
            
            {/* Mobile menu button */}
            <Button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden"
              variant="ghost"
              size="sm"
              aria-label="Toggle mobile menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl">
            <div className="container py-4 space-y-3">
              <Button
                onClick={() => {
                  window.open('https://chromewebstore.google.com/detail/tweetreply-ai-powered-twi/nhpilcnghmcdhcbhndmemiggfekmdgem', '_blank');
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
                size="sm"
              >
                <Chrome className="w-4 h-4 mr-2" />
                Add to Chrome
              </Button>
              <a 
                href="#features" 
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground smooth-transition"
              >
                Features
              </a>
              <a 
                href="#pricing" 
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground smooth-transition"
              >
                Pricing
              </a>
              <Button
                onClick={() => {
                  window.location.href = '/login';
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start bg-gradient-to-r from-primary to-primary/80 text-white"
                size="sm"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Sticky CTA for mobile */}
      {showStickyCTA && (
        <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background/95 backdrop-blur-xl border-t border-border/50 p-4 shadow-lg animate-in slide-in-from-bottom">
          <Button
            onClick={() => window.location.href = '/login'}
            className="w-full bg-gradient-to-r from-primary to-primary/80 text-white shadow-xl"
            size="lg"
            aria-label="Get started with TweetReplyAI"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Start Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      )}

      <main id="main-content">

      {/* Hero Section */}
      <section className="relative overflow-hidden" aria-labelledby="hero-heading">
        <div className="hero-gradient grid-pattern">
          <div className="container section-padding relative">
            {/* Floating Elements */}
            <div className="absolute top-10 right-10 w-24 h-24 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-2xl floating-animation" aria-hidden="true" />
            <div className="absolute bottom-10 left-10 w-32 h-32 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl floating-animation" style={{ animationDelay: '-3s' }} aria-hidden="true" />
            <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-full blur-2xl floating-animation" style={{ animationDelay: '-5s' }} aria-hidden="true" />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center relative z-10">
              {/* Left Column: Title, Subtitle, CTAs, Stats */}
              <div className="text-center lg:text-left">
                <motion.h1 
                  id="hero-heading" 
                  className="text-4xl md:text-6xl lg:text-7xl font-calibri font-bold mb-8 leading-tight tracking-tight"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.span 
                    className="gradient-text-shimmer block mb-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                  >
                    Never Waste Time
                  </motion.span>
                  <motion.span 
                    className="gradient-text-shimmer block mb-3 text-5xl md:text-7xl lg:text-8xl"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
                  >
                    On X Replies
                  </motion.span>
                  <motion.span 
                    className="gradient-text-shimmer block text-4xl md:text-6xl lg:text-7xl"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
                  >
                    Again
                  </motion.span>
                </motion.h1>
                
                <motion.p 
                  className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl lg:max-w-none leading-relaxed"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.8 }}
                >
                  Transform your X engagement with AI that creates authentic, 
                  contextual replies in seconds. <span className="text-foreground font-semibold">No more writer's block.</span>
                </motion.p>

                <motion.div 
                  className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 1.2 }}
                >
                  <Button 
                    size="lg"
                    onClick={() => window.location.href = '/login'}
                    className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift pulse-glow-primary magnetic-button ripple-effect border-0 font-semibold"
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
                </motion.div>

              </div>

              {/* Right Column: Tweet/Reply Demo */}
              <motion.div
                className="relative"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
              >
                <Card className="modern-glass border border-border/50 p-6 rounded-2xl shadow-xl card-modern overflow-hidden">
                  <AnimatePresence mode="wait">
                    {/* Original Tweet Card */}
                    <motion.div
                      key={`tweet-${currentExampleIndex}`}
                      className="mb-4 pb-4 border-b border-border/50"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.4 }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0 shadow-lg">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-muted-foreground">
                              {exampleReplies[currentExampleIndex].username}
                            </span>
                            <MessageCircle className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <p className="text-base text-foreground leading-relaxed">
                            {exampleReplies[currentExampleIndex].tweet}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Connection Line */}
                  <div className="flex items-center justify-center mb-4">
                    <div className="w-px h-8 bg-gradient-to-b from-primary/50 to-primary/20" />
                  </div>

                  {/* AI Reply Card */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`reply-${currentExampleIndex}`}
                      className="relative"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4, delay: 0.1 }}
                    >
                      <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-primary/10 rounded-xl blur-sm opacity-50 pulse-glow-primary" />
                      <div className="relative bg-card/50 rounded-xl p-4 border border-primary/20">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0 shadow-lg">
                            <Sparkles className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-primary">
                                TweetReplyAI
                              </span>
                              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                                AI
                              </Badge>
                            </div>
                            <p className="text-base text-foreground leading-relaxed">
                              {exampleReplies[currentExampleIndex].reply}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </Card>
              </motion.div>
            </div>

            {/* Quick Stats - Below Split Layout */}
            <motion.div 
              className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mt-12"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.4 }}
            >
              {[
                { value: "50K+", label: "Replies Generated" },
                { value: "99.9%", label: "Uptime" },
                { value: "<2s", label: "Response Time" },
                { value: "5★", label: "User Rating" }
              ].map((stat, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 1.6 + index * 0.1 }}
                >
                  <Card className="glass-depth border border-primary/20 p-4 micro-lift card-modern hover-glow-primary">
                    <div className="text-3xl font-bold text-primary mb-1 gradient-text">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* 
        ============================================
        SOCIAL PROOF SECTIONS - COMMENTED OUT
        ============================================
        These sections were removed as part of content authenticity updates.
        They contain placeholder content that should be replaced with real data.
        Uncomment and update when real company logos or press mentions are available.
        ============================================
      */}

      {/* 
        Trusted By Section - TO BE RESTORED
        Replace placeholder companies with real customer logos when available.
        TODO: Add real company logos or replace with generic "Trusted by 5,000+ users"
      */}
      {/* 
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
      */}

      {/* 
        As Seen On / Featured In The Press Section - TO BE RESTORED
        Replace fake press mentions with real press coverage when available.
        TODO: Add real press logos or remove if no press coverage exists
      */}
      {/* 
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
            <Card className="neomorphic border-0 p-6 text-center hover-lift card-modern">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Star className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">Product Hunt</p>
              <p className="text-sm text-muted-foreground">#1 Product of the Day</p>
            </Card>
            <Card className="neomorphic border-0 p-6 text-center hover-lift card-modern">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">TechCrunch</p>
              <p className="text-sm text-muted-foreground">Featured Startup</p>
            </Card>
            <Card className="neomorphic border-0 p-6 text-center hover-lift card-modern">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">VentureBeat</p>
              <p className="text-sm text-muted-foreground">AI Innovation Award</p>
            </Card>
          </div>
        </div>
      </motion.section>
      */}

      {/* Product Tour */}
      <section id="features" className="section-padding bg-gradient-to-b from-muted/5 to-muted/10">
        <div className="container">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
              <Rocket className="w-4 h-4 mr-2" />
              Three Ways to Use TweetReplyAI
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
              Choose Your <span className="gradient-text">Perfect X Workflow</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Generate perfect X replies with our AI-powered tools. Whether you prefer web, extension, or advanced AI customization, we've got you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: MessageCircle,
                title: "Web Application",
                description: "Paste X tweet text and generate replies instantly with our powerful web interface. Perfect for desktop and mobile users.",
                feature: "Mobile-friendly design",
                gradient: "from-primary/10 via-transparent to-purple-500/10",
                iconGradient: "from-primary to-primary/60"
              },
              {
                icon: Download,
                title: "Chrome Extension",
                description: "Generate replies directly on X with seamless integration. Works perfectly on the X platform.",
                feature: "One-click integration",
                gradient: "from-cyan-500/10 via-transparent to-blue-500/10",
                iconGradient: "from-cyan-500 to-blue-500"
              },
              {
                icon: Heart,
                title: "Natural, Human-like Replies",
                description: "Understands tone, humor, and context to make every reply sound authentically you",
                feature: "Contextual & authentic",
                gradient: "from-purple-500/10 via-transparent to-pink-500/10",
                iconGradient: "from-purple-500 to-pink-500"
              }
            ].map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <Card className="neomorphic border-0 card-3d group overflow-hidden relative">
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 smooth-transition`} />
                    <CardContent className="p-8 text-center relative z-10">
                      <motion.div 
                        className={`w-16 h-16 bg-gradient-to-br ${feature.iconGradient} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl group-hover:scale-110 group-hover:rotate-3 smooth-transition`}
                        aria-hidden="true"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <IconComponent className="w-8 h-8 text-white" />
                      </motion.div>
                      <h3 className="text-2xl font-display font-semibold mb-3 text-foreground">{feature.title}</h3>
                      <p className="text-muted-foreground mb-6 leading-relaxed">
                        {feature.description}
                      </p>
                      <div className="flex items-center justify-center text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 mr-2 text-primary" aria-hidden="true" />
                        <span>{feature.feature}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>


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
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Card className="neomorphic border-0 p-8 relative overflow-hidden card-modern">
                <div className="absolute top-4 right-4">
                  <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-500/20">Before</Badge>
                </div>
                <div className="space-y-6 mt-8">
                  {[
                    { label: "Weekly Replies", value: "45" },
                    { label: "Time Spent", value: "8 hrs" },
                    { label: "Engagement Rate", value: "2.3%" }
                  ].map((metric, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                      viewport={{ once: true }}
                    >
                      <div className="text-sm text-muted-foreground mb-2">{metric.label}</div>
                      <div className="text-4xl font-bold text-foreground gradient-text">{metric.value}</div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>

            {/* After */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Card className="neomorphic border-0 p-8 relative overflow-hidden border-2 border-primary/30 card-modern hover-glow-primary">
                <div className="absolute top-4 right-4">
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20">After</Badge>
                </div>
                <div className="space-y-6 mt-8">
                  {[
                    { label: "Weekly Replies", value: "320", change: "+611%" },
                    { label: "Time Spent", value: "2 hrs", change: "-75%" },
                    { label: "Engagement Rate", value: "7.9%", change: "+243%" }
                  ].map((metric, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
                      viewport={{ once: true }}
                    >
                      <div className="text-sm text-muted-foreground mb-2">{metric.label}</div>
                      <div className="flex items-baseline gap-2">
                        <div className="text-4xl font-bold text-primary gradient-text">{metric.value}</div>
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                          {metric.change}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>
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
                    <Card className="neomorphic border-0 p-10 relative overflow-hidden mx-4 card-modern">
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
              Everything You <span className="gradient-text">Need to Know</span> About X Reply Generation
            </h2>
          </div>
          
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => {
                const IconComponent = faq.icon === 'Zap' ? Zap : 
                                   faq.icon === 'MessageCircle' ? MessageCircle :
                                   faq.icon === 'Brain' ? Brain :
                                   faq.icon === 'Sparkles' ? Sparkles :
                                   Shield;
                return (
                  <AccordionItem 
                    key={index} 
                    value={`item-${index}`}
                    className="border-0"
                  >
                    <Card className="neomorphic border-0 overflow-hidden card-modern">
                      <AccordionTrigger 
                        className="px-6 py-4 hover:no-underline hover:bg-primary/5 smooth-transition"
                        data-testid={`faq-question-${index}`}
                        aria-label={`Toggle FAQ: ${faq.question}`}
                      >
                        <div className="flex items-center gap-3">
                          <IconComponent className="w-5 h-5 text-primary flex-shrink-0" aria-hidden="true" />
                          <span className="text-lg font-semibold text-left">{faq.question}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-4">
                        <p className="text-muted-foreground leading-relaxed pl-8" data-testid={`faq-answer-${index}`}>
                          {faq.answer}
                        </p>
                      </AccordionContent>
                    </Card>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <motion.section 
        className="section-padding"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <div className="container">
          <Card className="neomorphic border-0 p-12 md:p-16 text-center relative overflow-hidden max-w-5xl mx-auto card-modern hover-glow-primary">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10 mesh-overlay" />
            <motion.div 
              className="absolute top-10 right-10 w-32 h-32 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl floating-animation-enhanced"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{ 
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div 
              className="absolute bottom-10 left-10 w-40 h-40 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl floating-animation-enhanced"
              animate={{ 
                scale: [1, 1.3, 1],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{ 
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1
              }}
            />
            
            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
              >
                <Badge variant="secondary" className="mb-6 glass-depth border border-primary/20 shadow-lg pulse-glow-primary">
                  <Heart className="w-4 h-4 mr-2 text-primary" />
                  Join 5,000+ Creators
                </Badge>
              </motion.div>
              
              <motion.h2 
                className="text-4xl md:text-6xl font-display font-bold mb-6"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                viewport={{ once: true }}
              >
                Let Every X Tweet Spark <span className="gradient-text-shimmer">a Conversation</span> ✨
              </motion.h2>
              
              <motion.p 
                className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                viewport={{ once: true }}
              >
                More than 5,000 creators trust TweetReplyAI to generate perfect X replies, helping them stay authentic while scaling their engagement. Your voice, amplified with AI.
              </motion.p>
              
              <motion.div 
                className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-8"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                viewport={{ once: true }}
              >
                <Button 
                  size="lg"
                  onClick={() => window.location.href = '/login'}
                  className="h-16 px-10 text-lg bg-gradient-to-r from-primary to-primary/80 text-white shadow-2xl hover-lift pulse-glow-primary magnetic-button ripple-effect border-0 font-semibold"
                  data-testid="button-final-cta"
                >
                  <Sparkles className="w-6 h-6 mr-3" />
                  Start Free Trial
                  <ArrowRight className="w-6 h-6 ml-3" />
                </Button>
              </motion.div>

              <motion.div 
                className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                viewport={{ once: true }}
              >
                {[
                  { icon: Shield, text: "Secure & Private" },
                  { icon: CheckCircle, text: "Cancel Anytime" },
                  { icon: Sparkles, text: "AI-Powered" }
                ].map((item, index) => {
                  const IconComponent = item.icon;
                  return (
                    <motion.div
                      key={index}
                      className="flex items-center justify-center space-x-2 text-sm text-muted-foreground"
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.9 + index * 0.1 }}
                      viewport={{ once: true }}
                    >
                      <IconComponent className="w-4 h-4 text-primary" />
                      <span>{item.text}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          </Card>
        </div>
      </motion.section>

      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-20" role="contentinfo">
        <div className="container py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg" aria-hidden="true">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <span className="font-display font-bold text-lg">TweetReplyAI</span>
              </div>
              <p className="text-muted-foreground text-sm max-w-md">
                AI-powered X reply generator that helps you create authentic, contextual replies in seconds. Generate perfect X replies automatically. Transform your social media engagement.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#features" className="text-muted-foreground hover:text-foreground smooth-transition focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="text-muted-foreground hover:text-foreground smooth-transition focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="/login" className="text-muted-foreground hover:text-foreground smooth-transition focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
                    Get Started
                  </a>
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/privacy" className="text-muted-foreground hover:text-foreground smooth-transition focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="text-muted-foreground hover:text-foreground smooth-transition focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-border/50 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-muted-foreground text-sm">
                © {new Date().getFullYear()} TweetReplyAI. All rights reserved. Powered by advanced AI technology.
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Shield className="w-4 h-4" aria-hidden="true" />
                  Secure & Private
                </span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
