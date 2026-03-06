import { useState } from "react";
import { GoogleChromeLogo, PushPin, ArrowRight, Rocket, Lightning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { APP_URLS } from "@/config/constants";

interface ExtensionOnboardingProps {
  onComplete: () => void;
}

const steps = [
  {
    id: 1,
    icon: <GoogleChromeLogo className="w-5 h-5 text-white" weight="fill" />,
    iconBg: "bg-blue-500",
    title: "Add the Extension to Chrome",
    badge: "30 seconds",
    badgeVariant: "secondary" as const,
    description: (
      <>
        Hit{" "}
        <span className="font-semibold text-foreground">'Add to Chrome'</span>{" "}
        below. It's free and installs in seconds. Just click to add.
      </>
    ),
    cta: (
      <Button
        size="sm"
        className="mt-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-md gap-2"
        onClick={() => window.open(APP_URLS.CHROME_STORE, "_blank")}
      >
        <GoogleChromeLogo className="w-4 h-4" weight="fill" />
        Add to Chrome. It's Free
      </Button>
    ),
  },
  {
    id: 2,
    icon: <PushPin className="w-5 h-5 text-white" weight="fill" />,
    iconBg: "bg-purple-500",
    title: "Pin it so it's always ready",
    badge: null,
    description: (
      <>
        Click the{" "}
        <span className="font-semibold text-foreground">puzzle piece icon</span>{" "}
        in Chrome's toolbar → find{" "}
        <span className="font-semibold text-foreground">TweetReplyAI</span> →
        click{" "}
        <span className="font-semibold text-foreground">Pin</span>. Now it's one
        click away, always visible.
      </>
    ),
    cta: null,
  },
  {
    id: 3,
    icon: <span className="text-base font-bold text-white leading-none">𝕏</span>,
    iconBg: "bg-zinc-900 dark:bg-zinc-700",
    title: "Head over to X.com",
    badge: "The magic starts here",
    badgeVariant: "outline" as const,
    description: (
      <>
        Open a new tab and go to{" "}
        <span className="font-semibold text-foreground">x.com</span>. Scroll to
        any post you want to reply to. The magic is about to happen.
      </>
    ),
    cta: (
      <Button
        size="sm"
        variant="outline"
        className="mt-3 font-semibold gap-2"
        onClick={() => window.open("https://x.com", "_blank")}
      >
        <span className="font-bold">𝕏</span>
        Open X.com
        <ArrowRight className="w-4 h-4" />
      </Button>
    ),
  },
  {
    id: 4,
    icon: <Rocket className="w-5 h-5 text-white" weight="fill" />,
    iconBg: "bg-primary",
    title: "Watch AI craft your reply",
    badge: "You're done!",
    badgeVariant: "default" as const,
    description: (
      <>
        Click{" "}
        <span className="font-semibold text-foreground">Reply</span> on any post.
        TweetReplyAI pops up with smart, on brand replies ready to send in one
        click.
      </>
    ),
    cta: null,
  },
];

export function ExtensionOnboarding({ onComplete }: ExtensionOnboardingProps) {
  const [completing, setCompleting] = useState(false);

  const handleComplete = () => {
    setCompleting(true);
    setTimeout(() => {
      onComplete();
    }, 300);
  };

  return (
    <div
      className={`transition-all duration-300 ${completing ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
    >
      {/* Hero Header */}
      <div className="mb-6 p-6 rounded-2xl bg-primary/10 border border-primary/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0 shadow-lg">
            <Lightning className="w-6 h-6 text-white" weight="fill" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground leading-tight">
              You're one step away from 10x faster replies!
            </h2>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              The Chrome extension puts AI powered replies right where you need
              them, inside X.com. Reply from the same tab. Skip copy paste and tab switching.
            </p>
          </div>
        </div>
      </div>

      {/* Vertical Stepper */}
      <div className="relative">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          return (
            <div key={step.id} className="flex gap-4">
              {/* Step indicator + connecting line */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md flex-shrink-0 ${step.iconBg}`}
                >
                  {step.icon}
                </div>
                {!isLast && (
                  <div className="w-0.5 flex-1 my-1 bg-gradient-to-b from-border to-border/30 min-h-[24px]" />
                )}
              </div>

              {/* Step content */}
              <div className={`flex-1 min-w-0 ${isLast ? "pb-2" : "pb-6"}`}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground text-sm">
                    {step.title}
                  </span>
                  {step.badge && (
                    <Badge
                      variant={step.badgeVariant}
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      {step.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
                {step.cta}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTAs */}
      <div className="mt-8 flex flex-col items-center gap-3 pt-6 border-t border-border/50">
        <Button
          onClick={handleComplete}
          size="lg"
          className="w-full max-w-sm bg-primary hover:bg-primary/90 text-white font-bold shadow-lg gap-2 text-base"
        >
          <Rocket className="w-5 h-5" weight="fill" />
          I'm ready. Let's go!
          <ArrowRight className="w-5 h-5" />
        </Button>
        <button
          type="button"
          onClick={handleComplete}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          Already have it? Skip this guide
        </button>
      </div>
    </div>
  );
}
