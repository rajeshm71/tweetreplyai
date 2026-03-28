import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
// Core app icons: Phosphor per plan (auth, header, settings, etc.)
import { Lock, Envelope, User, CaretRight } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { APP_DISPLAY_NAME } from "@shared/constants";

const ALLOWED_RETURN_PATHS = ["/", "/app", "/app/pricing", "/profile", "/settings"];

function getReturnUrl(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("returnUrl");
  if (!raw) return null;
  try {
    const pathWithQuery = raw.startsWith("http") ? new URL(raw).pathname + new URL(raw).search : (raw.startsWith("/") ? raw : new URL(raw, window.location.origin).pathname + new URL(raw, window.location.origin).search);
    const pathOnly = pathWithQuery.split("?")[0];
    if (!ALLOWED_RETURN_PATHS.includes(pathOnly)) return null;
    return pathWithQuery;
  } catch {
    return null;
  }
}

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

/** Parse API error message from thrown error (e.g. "400: {\"message\":\"...\"}") and return friendly text. */
function getRegisterErrorMessage(errorMessage: string): string {
  const raw = (errorMessage || "").trim();
  if (raw === "Email already registered") {
    return "This email is already registered. Sign in or use a different email.";
  }
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]) as { message?: string };
      const msg = data?.message?.trim();
      if (msg === "Email already registered") {
        return "This email is already registered. Sign in or use a different email.";
      }
      if (msg) return msg;
    } catch {
      // ignore parse errors
    }
  }
  return "Registration failed. Please try again.";
}

export default function AuthPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", firstName: "", lastName: "" },
  });

  // Fix: Control dialog open state based on authentication status
  useEffect(() => {
    if (!authLoading) {
      if (isAuthenticated) {
        const returnUrl = getReturnUrl();
        navigate(returnUrl || "/");
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    }
  }, [isAuthenticated, authLoading, navigate]);

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      return await apiRequest('POST', '/api/auth/login', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({ title: "Success", description: "Logged in successfully" });
      loginForm.reset();
      const returnUrl = getReturnUrl();
      navigate(returnUrl || "/");
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      return await apiRequest('POST', '/api/auth/register', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({ title: "Success", description: "Account created successfully" });
      registerForm.reset();
      const returnUrl = getReturnUrl();
      navigate(returnUrl || "/");
    },
    onError: (error: any) => {
      setRegisterError(getRegisterErrorMessage(error?.message ?? ""));
    },
  });

  const handleLogin = loginForm.handleSubmit((data) => {
    loginMutation.mutate(data);
  });

  const handleRegister = registerForm.handleSubmit((data) => {
    setRegisterError(null);
    registerMutation.mutate(data);
  });

  // Fix: Reset forms when switching between login/register modes
  const switchToRegister = () => {
    loginForm.reset();
    setIsRegisterMode(true);
  };

  const switchToLogin = () => {
    registerForm.reset();
    setRegisterError(null);
    setIsRegisterMode(false);
  };

  const handleClose = () => {
    // Fix: Prevent closing during form submission
    if (loginMutation.isPending || registerMutation.isPending) {
      return;
    }
    setShowForgotPassword(false);
    setForgotEmail("");
    setIsOpen(false);
    navigate('/');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!email) {
      toast({ title: "Error", description: "Enter your email", variant: "destructive" });
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: data.message || "Failed to start password reset.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Success", description: data.message || "Password reset email sent." });
      setShowForgotPassword(false);
      setForgotEmail("");
    } catch {
      toast({ title: "Error", description: "Request failed. Try again later.", variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  // Don't render dialog if still loading auth state or if authenticated
  if (authLoading || isAuthenticated) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-left">
            {`Welcome to ${APP_DISPLAY_NAME}`}
          </DialogTitle>
        </DialogHeader>

        {!isRegisterMode ? (
          <>
            {showForgotPassword ? (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-2">
                  Enter your email to receive a password reset link.
                </div>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="Enter your email"
                        className="pl-10"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={forgotLoading}>
                    {forgotLoading ? "Sending..." : "Send reset link"}
                  </Button>
                </form>
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setForgotEmail(""); }}
                  className="text-sm text-primary hover:underline"
                >
                  Back to login
                </button>
              </div>
            ) : (
          <>
            <div className="text-sm text-muted-foreground mb-4">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={switchToRegister}
                className="text-primary hover:underline font-medium"
              >
                Register
              </button>
            </div>

            <div className="space-y-4">
              <Button
                onClick={() => {
                  // Fix (review): Pass returnUrl so Google OAuth callback redirects to pricing/checkout per plan
                  setIsGoogleLoading(true);
                  const returnUrl = getReturnUrl() || '/app/pricing';
                  window.location.href = '/api/auth/google' + (returnUrl ? '?returnUrl=' + encodeURIComponent(returnUrl) : '');
                }}
                variant="outline"
                className="w-full h-12 text-base"
                disabled={isGoogleLoading}
                data-testid="button-google-login"
              >
                {/* Google "G" Logo */}
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email Address</Label>
                  <div className="relative">
                    <Envelope className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email"
                      className="pl-10"
                      data-testid="input-login-email"
                      {...loginForm.register("email")}
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      className="pl-10"
                      data-testid="input-login-password"
                      {...loginForm.register("password")}
                    />
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember-me"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <Label
                      htmlFor="remember-me"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Remember me
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary"
                  disabled={loginMutation.isPending}
                  data-testid="button-login-submit"
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  <CaretRight className="w-4 h-4 ml-2" />
                </Button>
              </form>
            </div>
            </>
            )}
          </>
            ) : (
          <>
            <div className="text-sm text-muted-foreground mb-4">
              Already have an account?{" "}
              <button
                type="button"
                onClick={switchToLogin}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </div>

            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              {registerError && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>Registration failed</AlertTitle>
                  <AlertDescription>{registerError}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="register-firstName">First Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="register-firstName"
                      placeholder="John"
                      className="pl-10"
                      data-testid="input-register-firstname"
                      {...registerForm.register("firstName")}
                    />
                  </div>
                  {registerForm.formState.errors.firstName && (
                    <p className="text-sm text-destructive">{registerForm.formState.errors.firstName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-lastName">Last Name</Label>
                  <Input
                    id="register-lastName"
                    placeholder="Doe"
                    data-testid="input-register-lastname"
                    {...registerForm.register("lastName")}
                  />
                  {registerForm.formState.errors.lastName && (
                    <p className="text-sm text-destructive">{registerForm.formState.errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-email">Email Address</Label>
                <div className="relative">
                  <Envelope className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="Enter your email"
                    className="pl-10"
                    data-testid="input-register-email"
                    {...registerForm.register("email", {
                      onChange: () => setRegisterError(null),
                    })}
                  />
                </div>
                {registerForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{registerForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="Enter your password"
                    className="pl-10"
                    data-testid="input-register-password"
                    {...registerForm.register("password")}
                  />
                </div>
                {registerForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{registerForm.formState.errors.password.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Must be 8+ characters with uppercase, lowercase, and number
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-primary"
                disabled={registerMutation.isPending}
                data-testid="button-register-submit"
              >
                {registerMutation.isPending ? "Creating account..." : "Create Account"}
                <CaretRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
