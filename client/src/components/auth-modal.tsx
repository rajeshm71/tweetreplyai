import { useState } from "react";
import { ChatCircle, Envelope } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [emailStep, setEmailStep] = useState<'email' | 'verification'>('email');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGoogleSignIn = () => {
    // Redirect to Google OAuth
    window.location.href = '/api/login';
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Error",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/email/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to send verification code');
      }

      setEmailStep('verification');
      toast({
        title: "Code sent!",
        description: "Check your email for the verification code.",
      });

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send verification code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter the 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: email.trim(), 
          code: verificationCode.trim() 
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Invalid verification code');
      }

      // Successful verification - redirect to app
      window.location.href = '/';

    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid verification code. Please try again.",
        variant: "destructive",
      });
      setVerificationCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const resetToEmail = () => {
    setEmailStep('email');
    setVerificationCode('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <ChatCircle className="w-6 h-6 text-primary-foreground" />
          </div>
          <DialogTitle className="text-2xl font-semibold">
            Welcome to TweetReply
          </DialogTitle>
          <p className="text-muted-foreground">
            Sign in to start your free trial
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-6">
          {emailStep === 'email' ? (
            <>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                data-testid="button-google-signin"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    data-testid="input-email"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                  data-testid="button-send-code"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Envelope className="w-4 h-4 mr-2" />
                      Send verification code
                    </>
                  )}
                </Button>
              </form>
            </>
          ) : (
            <form onSubmit={handleVerificationSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verification-code">Verification code</Label>
                <Input
                  id="verification-code"
                  type="text"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  disabled={isLoading}
                  className="text-center text-lg tracking-widest"
                  data-testid="input-verification-code"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Code sent to {email}
                </p>
              </div>
              
              <div className="space-y-2">
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading || verificationCode.length !== 6}
                  data-testid="button-verify-code"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                      Verifying...
                    </>
                  ) : (
                    'Verify code'
                  )}
                </Button>
                
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full" 
                  onClick={resetToEmail}
                  disabled={isLoading}
                  data-testid="button-back-to-email"
                >
                  ← Back to email
                </Button>
              </div>
            </form>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          By continuing, you agree to our{' '}
          <a href="#" className="text-primary hover:underline">
            Terms
          </a>{' '}
          and{' '}
          <a href="#" className="text-primary hover:underline">
            Privacy Policy
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
