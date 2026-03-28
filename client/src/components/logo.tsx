import { Sparkles } from "lucide-react";
import { APP_DISPLAY_NAME } from "@shared/constants";
import { useLocation } from "wouter";

interface LogoProps {
  iconSize?: string;
  textSize?: string;
  showText?: boolean;
  className?: string;
}

export function Logo({ 
  iconSize = "w-8 h-8", 
  textSize = "text-xl",
  showText = true,
  className = ""
}: LogoProps) {
  const [, setLocation] = useLocation();

  return (
    <div 
      className={`flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg ${className}`}
      onClick={() => setLocation('/')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setLocation('/');
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Go to home page"
    >
      <div className={`${iconSize} rounded-lg bg-primary flex items-center justify-center transition-colors duration-150`} aria-hidden="true">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      {showText && (
        <span className={`${textSize} font-display font-bold text-primary`}>
          {APP_DISPLAY_NAME}
        </span>
      )}
    </div>
  );
}

