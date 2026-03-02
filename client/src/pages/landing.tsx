import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PricingCards } from "@/components/pricing-cards";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Zap, ArrowRight, ArrowLeft, CheckCircle, Rocket, Brain, MessageCircle, Download, Crown, Star, Shield, ChevronRight, TrendingUp, Chrome, Heart, Users, Menu, X, Copy, Check, Building2, Award, Clock, LayoutGrid, DollarSign, HelpCircle, Plus, Minus, RefreshCw, Smartphone } from "lucide-react";
import { Logo } from "@/components/logo";
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { generateStats, initializeStats, type Stats } from '@/utils/stats-generator';
import { APP_URLS, POLLING, UI } from "@/config/constants";
import { getQuotaSummaryText } from "@/config/pricing";

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);
  const [activeNavSection, setActiveNavSection] = useState<string | null>(null);
  const [openFAQ, setOpenFAQ] = useState<string | null>(null);
  
  // TODO: Interactive Live Demo - Commented out for future use
  // const [demoTweet, setDemoTweet] = useState("");
  // const [demoReply, setDemoReply] = useState("");
  // const [copiedReply, setCopiedReply] = useState(false);

  const exampleReplies = [
    {
      username: "@elonmusk",
      tweet: "Thinking about building XPhone.",
      reply: "If it comes with a Dogecoin wallet, I'm in 😂",
      icon: Rocket,
      iconGradient: "from-orange-500 to-amber-500",
      solidBg: "bg-orange-500",
      usernameColor: "text-orange-600",
      usernameEmoji: "🚀",
      cardGradient: "from-orange-500/5 to-amber-500/5",
      borderColor: "border-orange-500/20"
    },
    {
      username: "@ProductHunt",
      tweet: "What's the best productivity tool you've discovered this year?",
      reply: "TweetReplyAI ironically! Saves me hours crafting authentic replies daily 🚀",
      icon: TrendingUp,
      iconGradient: "from-green-500 to-emerald-500",
      solidBg: "bg-green-500",
      usernameColor: "text-green-600",
      usernameEmoji: "🔥",
      cardGradient: "from-green-500/5 to-emerald-500/5",
      borderColor: "border-green-500/20"
    },
    {
      username: "@TechCrunch",
      tweet: "AI is changing how we work. Thoughts?",
      reply: "Game changer for engagement! AI handles the replies, we focus on strategy ⚡",
      icon: Zap,
      iconGradient: "from-blue-500 to-indigo-500",
      solidBg: "bg-blue-500",
      usernameColor: "text-blue-600",
      usernameEmoji: "⚡",
      cardGradient: "from-blue-500/5 to-indigo-500/5",
      borderColor: "border-blue-500/20"
    },
    {
      username: "@ycombinator",
      tweet: "Just launched our startup! Any advice for first-time founders?",
      reply: "Congrats! Build in public, engage authentically, and ship fast. You've got this! 🎉",
      icon: Crown,
      iconGradient: "from-purple-500 to-pink-500",
      solidBg: "bg-purple-500",
      usernameColor: "text-purple-600",
      usernameEmoji: "👑",
      cardGradient: "from-purple-500/5 to-pink-500/5",
      borderColor: "border-purple-500/20"
    }
  ];

  // TODO: Interactive Live Demo - Commented out for future use
  // const exampleTweets = [
  //   "Just launched our new AI-powered app! What do you think?",
  //   "Thinking about building XPhone. Thoughts?",
  //   "What's the best productivity tool you've discovered this year?",
  //   "AI is changing how we work. Your thoughts?"
  // ];


  // Auto-cycle through example replies
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentExampleIndex((prev) => (prev + 1) % exampleReplies.length);
    }, UI.LANDING_EXAMPLE_CYCLE_MS);

    return () => clearInterval(interval);
  }, [exampleReplies.length]);

  // Initialize stats on mount
  useEffect(() => {
    initializeStats();
  }, []);

  // Use React Query for caching stats with hourly updates
  const { data: stats } = useQuery<Stats>({
    queryKey: ['landing-stats'],
    queryFn: () => {
      return generateStats();
    },
    staleTime: POLLING.STATS_STALE_TIME_MS,
    refetchInterval: POLLING.STATS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const testimonials = [
    {
      quote: "TweetReplyAI completely transformed how I engage on X. I save hours every week and my engagement has skyrocketed. The AI responses feel completely natural!",
      author: "Alex Thompson",
      role: "Marketing Director",
      rating: 5,
      verified: true,
      avatar: "AT",
      gradient: "from-blue-500 to-cyan-500",
      solidBg: "bg-blue-500",
      colorTheme: "blue"
    },
    {
      quote: "As a solo founder, TweetReplyAI helps me maintain authentic connections without spending all day on social media. It's like having a social media manager in my pocket!",
      author: "Arjun Patel",
      role: "Startup Founder",
      rating: 5,
      verified: true,
      avatar: "AP",
      gradient: "from-purple-500 to-pink-500",
      solidBg: "bg-purple-500",
      colorTheme: "purple"
    },
    {
      quote: "The quality of replies is incredible. Our community engagement has tripled, and people can't tell it's AI assisted. Game changer for content creators!",
      author: "Jessica Martinez",
      role: "Content Creator",
      rating: 5,
      verified: true,
      avatar: "JM",
      gradient: "from-orange-500 to-amber-500",
      solidBg: "bg-orange-500",
      colorTheme: "orange"
    }
  ];

  const [testimonialEmblaRef, testimonialEmblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: UI.TESTIMONIAL_AUTOPLAY_MS, stopOnInteraction: false })]);
  const [testimonialIndex, setTestimonialIndex] = useState(0);

  const onTestimonialSelect = useCallback(() => {
    if (!testimonialEmblaApi) return;
    setTestimonialIndex(testimonialEmblaApi.selectedScrollSnap());
  }, [testimonialEmblaApi]);

  // Features data - extracted to constant for maintainability
  const FEATURES = [
    {
      icon: RefreshCw,
      title: "Improvize Reply",
      description: "Not satisfied with a reply? Instantly regenerate and improve it with better context, tone, or style. Get the perfect response every time.",
      feature: "Perfect replies every time",
      gradient: "from-purple-500/10 via-transparent to-indigo-500/10",
      iconGradient: "from-purple-500 to-indigo-500",
      solidBg: "bg-purple-500"
    },
    {
      icon: Clock,
      title: "History Tracking",
      description: "Access your complete reply history instantly. Browse, search, and reuse your best replies anytime. Never lose track of your conversations.",
      feature: "Complete conversation history",
      gradient: "from-blue-500/10 via-transparent to-cyan-500/10",
      iconGradient: "from-blue-500 to-cyan-500",
      solidBg: "bg-blue-500"
    },
    {
      icon: TrendingUp,
      title: "Analytics Dashboard",
      description: "Track your reply performance with detailed analytics. See quality scores, engagement metrics, and feedback stats to improve over time.",
      feature: "Performance insights",
      gradient: "from-green-500/10 via-transparent to-emerald-500/10",
      iconGradient: "from-green-500 to-emerald-500",
      solidBg: "bg-green-500"
    },
    {
      icon: Users,
      title: "Reply Frequency Tracking",
      description: "Track how many times you've replied to a particular user in a day. Avoid over-replying and maintain balanced interactions.",
      feature: "Smart interaction balance",
      gradient: "from-orange-500/10 via-transparent to-amber-500/10",
      iconGradient: "from-orange-500 to-amber-500",
      solidBg: "bg-orange-500"
    },
    {
      icon: Brain,
      title: "Reply Like You",
      description: "Add your reply style and the system will reply like you, learning from your writing patterns. Maintain your authentic voice in every reply.",
      feature: "Your authentic voice",
      gradient: "from-violet-500/10 via-transparent to-purple-500/10",
      iconGradient: "from-violet-500 to-purple-500",
      solidBg: "bg-violet-500"
    },
    {
      icon: Zap,
      title: "Smart Tone Detection",
      description: "AI understands the tweet context and automatically selects the appropriate response style, whether it's humorous, supportive, professional, or casual.",
      feature: "Perfect tone matching",
      gradient: "from-yellow-500/10 via-transparent to-orange-500/10",
      iconGradient: "from-yellow-500 to-orange-500",
      solidBg: "bg-yellow-500"
    },
    {
      icon: Heart,
      title: "Auto Like on Reply",
      description: "Automatically like tweets when you reply, saving time and boosting engagement. Perfect for maintaining active presence without manual clicks.",
      feature: "Boost engagement automatically",
      gradient: "from-red-500/10 via-transparent to-pink-500/10",
      iconGradient: "from-red-500 to-pink-500",
      solidBg: "bg-red-500"
    },
    {
      icon: Rocket,
      title: "Real-time Generation",
      description: "Get AI replies in seconds, not minutes. Our optimized models deliver contextual responses instantly, so you never miss a conversation.",
      feature: "Lightning fast replies",
      gradient: "from-cyan-500/10 via-transparent to-blue-500/10",
      iconGradient: "from-cyan-500 to-blue-500",
      solidBg: "bg-cyan-500"
    },
    {
      icon: MessageCircle,
      title: "Context-Aware Replies",
      description: "Understands conversation threads, author context, and tweet metadata. Generates replies that fit naturally into ongoing discussions.",
      feature: "Natural conversation flow",
      gradient: "from-indigo-500/10 via-transparent to-purple-500/10",
      iconGradient: "from-indigo-500 to-purple-500",
      solidBg: "bg-indigo-500"
    },
    {
      icon: Star,
      title: "Quality Scoring",
      description: "Every reply gets an AI quality score. See how well your responses match tone, context, and authenticity before posting.",
      feature: "Quality assurance",
      gradient: "from-amber-500/10 via-transparent to-yellow-500/10",
      iconGradient: "from-amber-500 to-yellow-500",
      solidBg: "bg-amber-500"
    },
    {
      icon: Chrome,
      title: "One-Click Integration",
      description: "Seamless Chrome extension works directly on X. Click once, get instant replies without leaving your feed. No copy-paste needed.",
      feature: "Seamless workflow",
      gradient: "from-blue-600/10 via-transparent to-cyan-500/10",
      iconGradient: "from-blue-600 to-cyan-500",
      solidBg: "bg-blue-600"
    },
    {
      icon: Smartphone,
      title: "Mobile-Friendly",
      description: "Works perfectly on desktop, tablet, and mobile. Generate replies on-the-go with our responsive web interface.",
      feature: "Works everywhere",
      gradient: "from-slate-500/10 via-transparent to-gray-500/10",
      iconGradient: "from-slate-500 to-gray-500",
      solidBg: "bg-slate-500"
    }
  ] as const;


  useEffect(() => {
    if (!testimonialEmblaApi) return;
    onTestimonialSelect();
    testimonialEmblaApi.on('select', onTestimonialSelect);
    return () => {
      testimonialEmblaApi.off('select', onTestimonialSelect);
    };
  }, [testimonialEmblaApi, onTestimonialSelect]);

  // FAQ color theme configurations
  const faqColorThemes = {
    blue: {
      iconGradient: "from-blue-500 to-cyan-500",
      cardGradient: "from-blue-500/5 to-cyan-500/5",
      borderColor: "border-blue-500/20",
      hoverBorder: "hover:border-blue-500/40",
      textColor: "text-blue-600",
      iconBg: "bg-gradient-to-br from-blue-500 to-cyan-500"
    },
    green: {
      iconGradient: "from-green-500 to-emerald-500",
      cardGradient: "from-green-500/5 to-emerald-500/5",
      borderColor: "border-green-500/20",
      hoverBorder: "hover:border-green-500/40",
      textColor: "text-green-600",
      iconBg: "bg-gradient-to-br from-green-500 to-emerald-500"
    },
    purple: {
      iconGradient: "from-purple-500 to-pink-500",
      cardGradient: "from-purple-500/5 to-pink-500/5",
      borderColor: "border-purple-500/20",
      hoverBorder: "hover:border-purple-500/40",
      textColor: "text-purple-600",
      iconBg: "bg-gradient-to-br from-purple-500 to-pink-500"
    },
    orange: {
      iconGradient: "from-orange-500 to-amber-500",
      cardGradient: "from-orange-500/5 to-amber-500/5",
      borderColor: "border-orange-500/20",
      hoverBorder: "hover:border-orange-500/40",
      textColor: "text-orange-600",
      iconBg: "bg-gradient-to-br from-orange-500 to-amber-500"
    }
  };

  const faqs = [
    {
      question: "How do the credit quotas work?",
      answer: getQuotaSummaryText(),
      icon: "Zap",
      category: "quota",
      emoji: "💰",
      colorTheme: "blue" as keyof typeof faqColorThemes
    },
    {
      question: "Can I use both the extension and web app?",
      answer: "Yes! Your subscription covers both the Chrome extension and the mobile-friendly web interface. Your quota is shared across both platforms.",
      icon: "MessageCircle",
      category: "usage",
      emoji: "🚀",
      colorTheme: "green" as keyof typeof faqColorThemes
    },
    {
      question: "How authentic are the AI generated replies?",
      answer: "Our AI is trained to generate human-like, contextual replies. Most users post our suggestions without any edits. We avoid generic AI clichés and hashtags.",
      icon: "Brain",
      category: "ai",
      emoji: "🧠",
      colorTheme: "purple" as keyof typeof faqColorThemes
    },
    {
      question: "What AI models do you use?",
      answer: "We use the latest AI models, automatically selecting the best one for optimal results.",
      icon: "Sparkles",
      category: "ai",
      emoji: "🤖",
      colorTheme: "purple" as keyof typeof faqColorThemes
    },
    {
      question: "Can I cancel anytime?",
      answer: "Absolutely! You can cancel your subscription at any time. Your plan will remain active until the end of your current billing cycle.",
      icon: "Shield",
      category: "security",
      emoji: "🔒",
      colorTheme: "orange" as keyof typeof faqColorThemes
    },
    {
      question: "Is my data secure?",
      answer: "Yes, we take privacy seriously. Your tweets and replies are processed securely and we never store your personal data. All data transmission is encrypted.",
      icon: "Shield",
      category: "security",
      emoji: "🛡️",
      colorTheme: "orange" as keyof typeof faqColorThemes
    },
    {
      question: "How fast are replies generated?",
      answer: "Our AI typically generates replies in under 2 seconds. The actual time may vary slightly based on tweet complexity and server load.",
      icon: "Zap",
      category: "ai",
      emoji: "⚡",
      colorTheme: "purple" as keyof typeof faqColorThemes
    },
    {
      question: "Can I customize the tone of replies?",
      answer: "Currently, our AI automatically detects the tone and context of the original tweet. We're working on tone customization features for future releases.",
      icon: "MessageCircle",
      category: "usage",
      emoji: "⚙️",
      colorTheme: "green" as keyof typeof faqColorThemes
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
            setShowStickyCTA(window.scrollY > heroHeight * 0.5);
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

  // Track active navigation section based on scroll position
  useEffect(() => {
    const handleNavScroll = () => {
      const sections = ['features', 'pricing', 'faq'];
      const scrollPosition = window.scrollY + 150; // Offset for better UX

      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveNavSection(section);
            return;
          }
        }
      }
      setActiveNavSection(null);
    };

    window.addEventListener('scroll', handleNavScroll, { passive: true });
    handleNavScroll(); // Initial calculation
    
    return () => {
      window.removeEventListener('scroll', handleNavScroll);
    };
  }, []);

  // TODO: Interactive Live Demo - Commented out for future use
  // const generateDemoReply = (tweet: string) => {
  //   if (!tweet.trim()) {
  //     setDemoReply("");
  //     return;
  //   }
  //   
  //   const demoReplies = [
  //     "That's a great perspective! I totally agree 💯",
  //     "Interesting take! Have you considered the impact on... 🤔",
  //     "This is exactly what I've been thinking about lately!",
  //     "Love this! More people need to hear about it 🚀",
  //     "Thanks for sharing! This really resonated with me ✨"
  //   ];
  //   
  //   setTimeout(() => {
  //     const randomReply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
  //     setDemoReply(randomReply);
  //   }, DEMO_REPLY_DELAY);
  // };

  // const handleExampleTweetClick = (tweet: string) => {
  //   setDemoTweet(tweet);
  //   generateDemoReply(tweet);
  // };

  // const handleCopyReply = async () => {
  //   if (!demoReply) return;
  //   
  //   try {
  //     // Fixed: Added fallback for older browsers that don't support Clipboard API
  //     if (navigator.clipboard && navigator.clipboard.writeText) {
  //       // Modern Clipboard API (requires HTTPS or localhost)
  //       await navigator.clipboard.writeText(demoReply);
  //     } else {
  //       // Fallback for older browsers or non-HTTPS contexts
  //       const textArea = document.createElement('textarea');
  //       textArea.value = demoReply;
  //       textArea.style.position = 'fixed';
  //       textArea.style.left = '-999999px';
  //       textArea.style.top = '-999999px';
  //       document.body.appendChild(textArea);
  //       textArea.focus();
  //       textArea.select();
  //       
  //       try {
  //         document.execCommand('copy');
  //       } catch (err) {
  //         console.error('Fallback copy failed:', err);
  //         throw err;
  //       } finally {
  //         document.body.removeChild(textArea);
  //       }
  //     }
  //     
  //     setCopiedReply(true);
  //     setTimeout(() => setCopiedReply(false), COPY_SUCCESS_DURATION);
  //   } catch (err) {
  //     console.error('Failed to copy:', err);
  //     // Could show user-friendly error message here
  //   }
  // };

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to content link */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      {/* Navigation */}
      <nav 
        className="sticky top-0 z-50 backdrop-blur-xl bg-gradient-to-r from-blue-50/60 via-purple-50/60 to-blue-50/60 border-b border-blue-200/30 shadow-md"
        aria-label="Main navigation"
      >
        <div className="container flex items-center justify-between h-16 md:h-18">
          {/* Left: Logo and Add to Chrome */}
          <div className="flex items-center space-x-4">
            <Logo />
            
            <Button 
              onClick={() => {
                window.open(APP_URLS.CHROME_STORE, '_blank');
              }}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl border-0 font-medium shadow-md hover:shadow-xl hover:shadow-blue-500/20 hover:scale-105 transition-all duration-300 hidden sm:flex"
              data-testid="button-add-to-chrome"
              size="sm"
              aria-label="Add TweetReplyAI to Chrome"
            >
              <Chrome className="w-4 h-4 mr-2" aria-hidden="true" />
              Add to Chrome
            </Button>
          </div>
          
          {/* Center: Navigation Links */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center space-x-2 md:space-x-3">
            <a 
              href="#features" 
              className={`group relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 hidden md:flex focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                activeNavSection === 'features'
                  ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-700 shadow-md border border-green-500/20'
                  : 'text-muted-foreground hover:bg-muted/30 hover:scale-105'
              }`}
              aria-label="Navigate to Features section"
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('features');
                element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <LayoutGrid className={`w-4 h-4 transition-all duration-300 ${
                activeNavSection === 'features' 
                  ? 'text-green-600' 
                  : 'text-muted-foreground group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-green-400 group-hover:bg-clip-text'
              }`} />
              <span className={`transition-all duration-300 ${
                activeNavSection === 'features'
                  ? ''
                  : 'group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-green-400 group-hover:bg-clip-text'
              }`}>Features</span>
              {activeNavSection === 'features' && (
                <motion.div
                  layoutId="activeNavIndicator-features"
                  className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-full -z-10"
                  initial={false}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </a>
            <a 
              href="#pricing" 
              className={`group relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 hidden md:flex focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                activeNavSection === 'pricing'
                  ? 'bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-red-500/10 text-rose-700 shadow-md border border-pink-500/20'
                  : 'text-muted-foreground hover:bg-muted/30 hover:scale-105'
              }`}
              aria-label="Navigate to Pricing section"
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('pricing');
                element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <DollarSign className={`w-4 h-4 transition-all duration-300 ${
                activeNavSection === 'pricing' 
                  ? 'text-rose-600' 
                  : 'text-muted-foreground group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-pink-400 group-hover:to-rose-400 group-hover:bg-clip-text'
              }`} />
              <span className={`transition-all duration-300 ${
                activeNavSection === 'pricing'
                  ? ''
                  : 'group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-pink-400 group-hover:to-rose-400 group-hover:bg-clip-text'
              }`}>Pricing</span>
              {activeNavSection === 'pricing' && (
                <motion.div
                  layoutId="activeNavIndicator-pricing"
                  className="absolute inset-0 bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-red-500/10 rounded-full -z-10"
                  initial={false}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </a>
            <a 
              href="#faq" 
              className={`group relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 hidden md:flex focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                activeNavSection === 'faq'
                  ? 'bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 text-indigo-700 shadow-md border border-blue-500/20'
                  : 'text-muted-foreground hover:bg-muted/30 hover:scale-105'
              }`}
              aria-label="Navigate to FAQ section"
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('faq');
                element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <HelpCircle className={`w-4 h-4 transition-all duration-300 ${
                activeNavSection === 'faq' 
                  ? 'text-indigo-600' 
                  : 'text-muted-foreground group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-400 group-hover:bg-clip-text'
              }`} />
              <span className={`transition-all duration-300 ${
                activeNavSection === 'faq'
                  ? ''
                  : 'group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-400 group-hover:bg-clip-text'
              }`}>FAQs</span>
              {activeNavSection === 'faq' && (
                <motion.div
                  layoutId="activeNavIndicator-faq"
                  className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 rounded-full -z-10"
                  initial={false}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </a>
          </div>
          
          {/* Right: Start Replying Button and Mobile Menu */}
          <div className="flex items-center space-x-2">
            <Button 
              onClick={() => window.location.href = '/login'}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl border-0 font-medium shadow-md hover:shadow-xl hover:shadow-blue-500/20 hover:scale-105 transition-all duration-300 hidden sm:flex"
              data-testid="button-signin"
              aria-label="Start replying with TweetReplyAI"
              size="sm"
            >
              Start Replying
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
          <div className="md:hidden border-t border-blue-200/30 bg-gradient-to-r from-blue-50/60 via-purple-50/60 to-blue-50/60 backdrop-blur-xl">
            <div className="container py-4 space-y-3">
              <Button
                onClick={() => {
                  window.open(APP_URLS.CHROME_STORE, '_blank');
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300"
                size="sm"
              >
                <Chrome className="w-4 h-4 mr-2" />
                Add to Chrome
              </Button>
              <a 
                href="#features" 
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-transparent hover:bg-gradient-to-r hover:from-blue-400 hover:to-green-400 hover:bg-clip-text hover:bg-muted/20 transition-all duration-300"
              >
                Features
              </a>
              <a 
                href="#pricing" 
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-transparent hover:bg-gradient-to-r hover:from-pink-400 hover:to-rose-400 hover:bg-clip-text hover:bg-muted/20 transition-all duration-300"
              >
                Pricing
              </a>
              <a 
                href="#faq" 
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-transparent hover:bg-gradient-to-r hover:from-blue-400 hover:to-purple-400 hover:bg-clip-text hover:bg-muted/20 transition-all duration-300"
              >
                FAQs
              </a>
              <Button
                onClick={() => {
                  window.location.href = '/login';
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl border-0 font-medium shadow-md hover:shadow-xl hover:shadow-blue-500/20 hover:scale-105 transition-all duration-300"
                size="sm"
              >
                Start Replying
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
            variant="ghost"
            onClick={() => window.location.href = '/login'}
            className="w-full bg-primary text-white border-0 font-semibold hover:scale-105 transition-all duration-300"
            size="lg"
            aria-label="Start replying with TweetReplyAI"
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
                    variant="ghost"
                    size="lg"
                    onClick={() => window.location.href = '/login'}
                    className="h-14 px-8 text-lg bg-primary text-white border-0 font-semibold hover:scale-105 transition-all duration-300"
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
                <Card className="modern-glass border border-border/50 p-6 rounded-2xl shadow-xl card-modern overflow-hidden relative">
                  <AnimatePresence mode="wait">
                    {/* Original Tweet Card */}
                    <motion.div
                      key={`tweet-${currentExampleIndex}`}
                      className={`mb-4 pb-4 border-b-2 rounded-xl p-4 relative overflow-hidden ${exampleReplies[currentExampleIndex].borderColor}`}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.4 }}
                    >
                      {/* User-specific gradient background */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${exampleReplies[currentExampleIndex].cardGradient} opacity-50`} />
                      
                      <div className="relative z-10 flex items-start gap-3">
                        {/* User-specific icon with gradient */}
                        <div className={`w-12 h-12 rounded-xl ${exampleReplies[currentExampleIndex].solidBg} flex items-center justify-center flex-shrink-0`}>
                          {(() => {
                            const UserIcon = exampleReplies[currentExampleIndex].icon;
                            return <UserIcon className="w-6 h-6 text-white" />;
                          })()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-base font-semibold ${exampleReplies[currentExampleIndex].usernameColor}`}>
                                {exampleReplies[currentExampleIndex].username}
                              </span>
                              <span className="text-base opacity-80" aria-hidden="true">
                                {exampleReplies[currentExampleIndex].usernameEmoji}
                              </span>
                            </div>
                            <MessageCircle className={`w-4 h-4 ${exampleReplies[currentExampleIndex].usernameColor} opacity-60`} />
                          </div>
                          <p className="text-base text-foreground leading-relaxed">
                            {exampleReplies[currentExampleIndex].tweet}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Connection Line - Enhanced with user-specific gradient */}
                  <div className="flex items-center justify-center mb-4">
                    <div className={`relative w-px h-10 bg-gradient-to-b ${exampleReplies[currentExampleIndex].iconGradient} opacity-50 animate-pulse`} />
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
                      {/* Enhanced glow effect */}
                      <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-primary/15 rounded-xl blur-sm opacity-60 pulse-glow-primary" />
                      
                      {/* AI Reply Card with enhanced styling */}
                      <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 rounded-xl p-4 border-2 border-primary/30 shadow-lg">
                        {/* Subtle mesh overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-xl opacity-50" />
                        
                        <div className="relative z-10 flex items-start gap-3">
                          {/* Enhanced TweetReplyAI icon */}
                          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-base font-semibold text-primary">
                                TweetReplyAI
                              </span>
                              <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-primary/30 font-semibold">
                                AI
                              </Badge>
                              <span className="text-base opacity-80" aria-hidden="true">✨</span>
                            </div>
                            <p className="text-base text-foreground leading-relaxed font-medium">
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
          </div>
        </div>
      </section>

      {/* Quick Stats Section - Clean Simple Layout */}
      {stats && (
        <section className="section-padding bg-gradient-to-b from-background to-muted/10">
          <div className="container">
            {/* Title Section */}
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
                Numbers That Tell <span className="gradient-text">Our Story</span>
              </h2>
            </div>

            {/* Stats Grid */}
            <motion.div 
              className="max-w-4xl stats-grid mx-auto"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.4 }}
            >
              {[
                { 
                  value: stats.repliesGenerated.formatted, 
                  label: "Replies Generated",
                  icon: Zap,
                  emoji: "💬",
                  subtitle: stats.repliesGenerated.weeklyIncrease,
                  gradient: "from-blue-500 to-cyan-500",
                  solidBg: "bg-blue-500",
                  borderColor: "border-blue-500/20",
                  hoverBorder: "hover:border-blue-500/40",
                  textGradient: "bg-gradient-to-r from-blue-600 to-cyan-600",
                  bgGradient: "from-blue-500/5 to-cyan-500/5",
                  badgeColor: "text-blue-600"
                },
                { 
                  value: stats.impressions.formatted, 
                  label: "Impressions",
                  icon: TrendingUp,
                  emoji: "📈",
                  gradient: "from-indigo-500 to-purple-500",
                  solidBg: "bg-indigo-500",
                  borderColor: "border-purple-500/20",
                  hoverBorder: "hover:border-purple-500/40",
                  textGradient: "bg-gradient-to-r from-indigo-600 to-purple-600",
                  bgGradient: "from-indigo-500/5 to-purple-500/5",
                  badgeColor: "text-purple-600"
                },
                { 
                  value: stats.engagementsBoost.formatted,
                  label: "Engagements Boost",
                  icon: Rocket,
                  emoji: "🚀",
                  gradient: "from-emerald-500 to-green-500",
                  solidBg: "bg-emerald-500",
                  borderColor: "border-green-500/20",
                  hoverBorder: "hover:border-green-500/40",
                  textGradient: "bg-gradient-to-r from-emerald-600 to-green-600",
                  bgGradient: "from-emerald-500/5 to-green-500/5",
                  badgeColor: "text-green-600"
                },
                { 
                  value: stats.hoursSaved.formatted,
                  label: "Hours Saved",
                  icon: Clock,
                  emoji: "⏱️",
                  gradient: "from-orange-500 to-amber-500",
                  solidBg: "bg-orange-500",
                  borderColor: "border-orange-500/20",
                  hoverBorder: "hover:border-orange-500/40",
                  textGradient: "bg-gradient-to-r from-orange-600 to-amber-600",
                  bgGradient: "from-orange-500/5 to-amber-500/5",
                  badgeColor: "text-orange-600"
                }
              ].map((stat, index) => {
                const IconComponent = stat.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 1.6 + index * 0.1 }}
                  >
                    <Card 
                      className={`glass-depth border-2 ${stat.borderColor} ${stat.hoverBorder} micro-lift card-modern relative overflow-hidden group transition-all duration-300`}
                      style={{ padding: '1.5rem' }}
                      aria-label={`${stat.label}: ${stat.value}${stat.subtitle ? `, ${stat.subtitle}` : ''}`}
                    >
                      {/* Subtle gradient background */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-50 group-hover:opacity-70 transition-opacity duration-300`} />
                      
                      <div className="relative z-10" style={{ textAlign: 'center' }}>
                        {/* Icon - Top, Centered */}
                        <div className={`stat-icon-container w-12 h-12 md:w-14 md:h-14 rounded-xl ${stat.solidBg} flex items-center justify-center`} style={{ margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconComponent className="w-6 h-6 md:w-7 md:h-7 text-white" />
                        </div>
                        
                        {/* Value - Large, Bold, Centered */}
                        {/* Fixed: Removed redundant fontWeight and lineHeight (already in CSS class) */}
                        <div className={`stat-value-text text-4xl md:text-5xl ${stat.textGradient} bg-clip-text text-transparent pr-1`} style={{ marginBottom: '0.5rem' }}>
                          {stat.value}
                        </div>
                        
                        {/* Label - Below Number */}
                        <div style={{ marginBottom: '0.75rem' }}>
                          <span className="text-base md:text-lg font-semibold text-foreground">{stat.label}</span>
                          <span className="text-base md:text-lg opacity-80" aria-hidden="true" style={{ marginLeft: '0.25rem' }}>{stat.emoji}</span>
                        </div>
                        
                        {/* Weekly Increase Badge - Bottom */}
                        {stat.subtitle && (
                          <div className={`rounded-full bg-gradient-to-r ${stat.bgGradient} border ${stat.borderColor} text-xs md:text-sm font-semibold stat-weekly-badge`} style={{ display: 'inline-flex', alignItems: 'center', padding: '0.375rem 0.75rem', gap: '0.375rem' }}>
                            <TrendingUp className={`w-3 h-3 ${stat.badgeColor}`} />
                            <span className={stat.badgeColor}>{stat.subtitle}</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>
      )}

      {/* 
        ============================================
        INTERACTIVE LIVE DEMO SECTION - COMMENTED OUT
        ============================================
        This section allows users to enter tweets and see AI-generated replies.
        It was removed but kept in memory for future restoration.
        Uncomment when needed.
        ============================================
      */}
      {/* 
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
              See <span className="gradient-text">AI Magic</span> for X Replies
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Type any X tweet below and watch TweetReplyAI generate a perfect response instantly. Generate authentic X replies automatically.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Card className="neomorphic border-0 p-8 card-modern">
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium mb-2 block">Enter an X Tweet</label>
                  <textarea
                    className="w-full p-4 rounded-xl border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 smooth-transition"
                    placeholder="Example: Just launched our new AI-powered app! What do you think?"
                    aria-label="Enter an X tweet to generate AI reply"
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
                  <div className="bg-primary/5 rounded-xl p-6 border border-primary/20 animate-in fade-in slide-in-from-bottom-4 duration-500" role="region" aria-live="polite" aria-label="Generated reply">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0" aria-hidden="true">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-primary font-semibold">TweetReplyAI Generated</div>
                          <Button
                            onClick={handleCopyReply}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label="Copy reply to clipboard"
                          >
                            {copiedReply ? (
                              <Check className="w-4 h-4 text-primary" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
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
                  <div>
                    <div className="text-center text-sm text-muted-foreground mb-4">
                      <Sparkles className="w-4 h-4 inline mr-2" aria-hidden="true" />
                      Start typing to see AI-generated replies appear instantly
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {exampleTweets.map((tweet, idx) => (
                        <motion.button
                          key={idx}
                          onClick={() => handleExampleTweetClick(tweet)}
                          className="text-left p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 smooth-transition text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 micro-lift"
                          aria-label={`Try example tweet: ${tweet.substring(0, 30)}...`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          "{tweet.substring(0, 50)}..."
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <motion.div 
              className="text-center mt-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Button
                variant="ghost"
                onClick={() => window.location.href = '/login'}
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white border-0 font-semibold hover:scale-105 transition-all duration-300"
                data-testid="button-demo-cta"
              >
                Get Full Access Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.section>
      */}

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
        TODO: Add real company logos or replace with generic "Trusted by users"
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
              <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Star className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">Product Hunt</p>
              <p className="text-sm text-muted-foreground">#1 Product of the Day</p>
            </Card>
            <Card className="neomorphic border-0 p-6 text-center hover-lift card-modern">
              <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">TechCrunch</p>
              <p className="text-sm text-muted-foreground">Featured Startup</p>
            </Card>
            <Card className="neomorphic border-0 p-6 text-center hover-lift card-modern">
              <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-lg mb-1">VentureBeat</p>
              <p className="text-sm text-muted-foreground">AI Innovation Award</p>
            </Card>
          </div>
        </div>
      </motion.section>
      */}

      {/* Features Section */}
      <section id="features" className="section-padding bg-gradient-to-b from-muted/5 to-muted/10">
        <div className="container">
          <div className="text-center mb-8">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20">
              <Rocket className="w-4 h-4 mr-2" />
              Powerful Features
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
              Everything You Need to <span className="gradient-text">Excel on X</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-6">
              Discover powerful features that make replying effortless, intelligent, and engaging. From automatic likes to smart tone detection, we've got you covered.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {FEATURES.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  viewport={{ once: true, margin: "-50px" }}
                >
                  <Card className="neomorphic border-0 card-3d group overflow-hidden relative h-full">
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 smooth-transition`} />
                    <CardContent className="p-6 text-center relative z-10 flex flex-col h-full">
                      <motion.div 
                        className={`w-12 h-12 ${feature.solidBg} rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 group-hover:rotate-3 smooth-transition`}
                        aria-hidden="true"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <IconComponent className="w-6 h-6 text-white" />
                      </motion.div>
                      <h3 className="text-xl font-display font-semibold mb-2 text-foreground">{feature.title}</h3>
                      <p className="text-muted-foreground mb-4 leading-relaxed text-sm line-clamp-2 flex-grow">
                        {feature.description}
                      </p>
                      <div className="flex items-center justify-center text-xs text-muted-foreground">
                        <CheckCircle className="w-3 h-3 mr-2 text-primary" aria-hidden="true" />
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
              Average metrics from our active users
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
                      className="text-center"
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
                      className="text-center"
                    >
                      <div className="text-sm text-muted-foreground mb-2">{metric.label}</div>
                      <div className="flex items-baseline gap-2 justify-center">
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
          <Card className="relative overflow-hidden border border-border/50 bg-gradient-to-br from-background via-muted/5 to-background backdrop-blur-xl shadow-2xl rounded-3xl p-6 md:p-8">
            <CardContent className="p-0">
              <div className="text-center mb-16">
                <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium glass-effect border border-primary/20 shadow-lg">
                  <Crown className="w-4 h-4 mr-2" />
                  Simple, Transparent Pricing 💎
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
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Testimonials Carousel */}
      <motion.section 
        className="section-padding bg-gradient-to-b from-background via-background to-muted/5"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <div className="container">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20 shadow-lg">
              <Heart className="w-4 h-4 mr-2" />
              What Our Users Say
            </Badge>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              See how TweetReplyAI is transforming X engagement for creators, founders, and marketers worldwide.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="overflow-hidden" ref={testimonialEmblaRef}>
              <div className="flex">
                {testimonials.map((testimonial, index) => (
                  <div key={index} className="flex-[0_0_100%] min-w-0 px-4">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                      <Card className="modern-glass border border-border/50 p-8 md:p-10 relative overflow-hidden card-modern hover-lift group transition-all duration-300">
                        {/* Gradient Background Overlay */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${testimonial.gradient} opacity-5 group-hover:opacity-10 transition-opacity duration-300`} />
                        
                        {/* Subtle Mesh Texture */}
                        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.5),transparent_50%)]" />
                        
                        {/* Enhanced Shadow Layer */}
                        <div className="absolute inset-0 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
                          style={{ boxShadow: `0 20px 60px -15px rgba(var(--primary-rgb), 0.3)` }} />
                        
                        <div className="relative z-10">
                          {/* Star Rating */}
                          <div className="flex items-center justify-center mb-6">
                            <div className="flex space-x-1">
                              {[...Array(5)].map((_, i) => (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, scale: 0 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.3, delay: 0.2 + i * 0.1 }}
                                >
                                  <Star className="w-7 h-7 md:w-8 md:h-8 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                                </motion.div>
                              ))}
                            </div>
                          </div>

                          {/* Quote Text */}
                          <blockquote className="text-xl md:text-2xl lg:text-3xl text-center text-foreground leading-relaxed mb-8 font-medium relative">
                            <span className="absolute -top-4 -left-2 md:-top-6 md:-left-4 text-6xl md:text-8xl font-serif text-primary/10 leading-none">"</span>
                            <span className="relative z-10">{testimonial.quote}</span>
                            <span className="absolute -bottom-8 -right-2 md:-bottom-10 md:-right-4 text-6xl md:text-8xl font-serif text-primary/10 leading-none">"</span>
                          </blockquote>

                          {/* Author Info */}
                          <div className="flex items-center justify-center gap-4">
                            {/* Avatar */}
                            <motion.div
                              className={`w-16 h-16 md:w-20 md:h-20 rounded-full ${testimonial.solidBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
                              whileHover={{ scale: 1.1, rotate: 5 }}
                              transition={{ type: "spring", stiffness: 300 }}
                            >
                              <span className="text-white text-xl md:text-2xl font-bold">{testimonial.avatar}</span>
                            </motion.div>

                            {/* Author Details */}
                            <div className="flex-1 text-center md:text-left">
                              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                                <span className={`text-lg md:text-xl font-bold bg-gradient-to-r ${testimonial.gradient} bg-clip-text text-transparent`}>
                                  {testimonial.author}
                                </span>
                                {testimonial.verified && (
                                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                                    <Shield className="w-3 h-3 mr-1" />
                                    Verified
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm md:text-base text-muted-foreground">
                                {testimonial.role}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Enhanced Pagination */}
            <div className="flex justify-center items-center gap-3 mt-8">
              {testimonials.map((_, index) => (
                <motion.button
                  key={index}
                  className={`rounded-full transition-all duration-300 ${
                    index === testimonialIndex 
                      ? `bg-gradient-to-r ${testimonials[index].gradient} w-10 h-3` 
                      : 'bg-muted-foreground/30 w-3 h-3 hover:bg-muted-foreground/50'
                  }`}
                  onClick={() => testimonialEmblaApi?.scrollTo(index)}
                  aria-label={`Go to testimonial ${index + 1}`}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* FAQ Section */}
      <section id="faq" className="section-padding bg-gradient-to-b from-background to-muted/10">
        <div className="container">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 glass-effect border border-primary/20 shadow-lg">
              <Star className="w-4 h-4 mr-2" />
              Frequently Asked Questions
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
              Everything You <span className="gradient-text">Need to Know</span> About X Reply Generation
            </h2>
          </div>
          
          <div className="max-w-3xl mx-auto">
            <Card className="relative overflow-hidden border border-border/50 bg-gradient-to-br from-background via-muted/5 to-background backdrop-blur-xl shadow-2xl rounded-3xl">
              <CardContent className="p-6 md:p-8">
                <Accordion 
                  type="single" 
                  collapsible 
                  className="space-y-4"
                  value={openFAQ || undefined}
                  onValueChange={(value) => setOpenFAQ(value)}
                >
                  {faqs.map((faq, index) => {
                    const isOpen = openFAQ === `item-${index}`;
                    return (
                      <AccordionItem 
                        key={index} 
                        value={`item-${index}`}
                        className="border-0"
                      >
                        <Card className="relative overflow-hidden border border-border/50 bg-gradient-to-br from-primary/5 via-primary/3 to-primary/5 hover:from-primary/8 hover:via-primary/5 hover:to-primary/8 backdrop-blur-sm shadow-md hover:shadow-lg transition-all duration-300 group hover:border-primary/40 rounded-xl">
                          <div className="relative z-10">
                            <AccordionTrigger 
                              className="px-6 py-5 hover:no-underline hover:bg-transparent transition-all duration-200 group/trigger [&>svg]:hidden"
                              data-testid={`faq-question-${index}`}
                              aria-label={`Toggle FAQ: ${faq.question}`}
                            >
                              <div className="flex items-center gap-4 w-full text-left">
                                {/* Modern Icon with solid primary background */}
                                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                                  <Shield className="w-6 h-6 text-white" aria-hidden="true" />
                                </div>
                                
                                {/* Question text */}
                                <div className="flex-1 pt-1">
                                  <span className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors duration-200">
                                    {faq.question}
                                  </span>
                                </div>
                                
                                {/* Plus/Minus button */}
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center transition-all duration-200 group-hover:bg-primary/20">
                                  {isOpen ? (
                                    <Minus className="w-5 h-5 text-primary" />
                                  ) : (
                                    <Plus className="w-5 h-5 text-primary" />
                                  )}
                                </div>
                              </div>
                            </AccordionTrigger>
                            
                            <AccordionContent className="px-6 pb-5">
                              <div className="flex items-start gap-4">
                                {/* Spacer for icon alignment */}
                                <div className="w-12 flex-shrink-0" />
                                <p className="text-muted-foreground leading-relaxed text-base" data-testid={`faq-answer-${index}`}>
                                  {faq.answer}
                                </p>
                              </div>
                            </AccordionContent>
                          </div>
                        </Card>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
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
                  Join Creators
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
                Creators trust TweetReplyAI to generate perfect X replies, helping them stay authentic while scaling their engagement. Your voice, amplified with AI.
              </motion.p>
              
              <motion.div 
                className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-8"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                viewport={{ once: true }}
              >
                <Button 
                  variant="ghost"
                  size="lg"
                  onClick={() => window.location.href = '/login'}
                  className="h-16 px-10 text-lg bg-primary text-white border-0 font-semibold hover:scale-105 transition-all duration-300"
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
                  { icon: Sparkles, text: "AI Enhanced" }
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
                <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center" aria-hidden="true">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <span className="font-display font-bold text-lg">TweetReplyAI</span>
              </div>
              <p className="text-muted-foreground text-sm max-w-md">
                AI driven X reply generator that helps you create authentic, contextual replies in seconds. Generate perfect X replies automatically. Transform your social media engagement.
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
                    Start Replying
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
                © {new Date().getFullYear()} TweetReplyAI. All rights reserved.
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
