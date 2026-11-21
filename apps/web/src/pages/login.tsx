import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme';
import { Shield, Mail, Terminal, ArrowRight, CheckCircle2, Moon, Sun } from 'lucide-react';

export default function Login() {
  const { user, loading: authLoading, loginWithGoogle, sendOTP, verifyOTP, loginBypass } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Theme tokens for the canvas, re-read only when the theme changes —
  // reading getComputedStyle every animation frame was wasted work, the
  // same fix the landing canvas got in round 5.
  const themeTokensRef = useRef({ bg: '#111111', grid: 'rgba(255,255,255,0.01)' });
  useEffect(() => {
    const rootStyles = getComputedStyle(document.documentElement);
    themeTokensRef.current = {
      bg: rootStyles.getPropertyValue('--canvas-bg').trim() || '#111111',
      grid: rootStyles.getPropertyValue('--canvas-grid').trim() || 'rgba(255,255,255,0.01)',
    };
  }, [theme]);

  // Redirect to dashboard if session already active
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate]);

  // Synapse background animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || navigator.hardwareConcurrency < 4) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
    }

    const nodesCount = Math.min(60, Math.floor((width * height) / 20000));
    const nodes: Node[] = [];

    for (let i = 0; i < nodesCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.5 + 0.5,
      });
    }

    // Respect reduced-motion: draw one static frame instead of animating.
    const prefersReducedMotion = () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resizeHandler = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      // With reduced motion only one static frame is ever drawn, and
      // resizing clears the canvas — redraw that frame so the background
      // does not go blank. When animating, the running loop repaints on
      // its next frame, so no extra draw is scheduled here.
      if (prefersReducedMotion()) animate();
    };
    window.addEventListener('resize', resizeHandler);

    const animate = () => {
      // Theme tokens are cached in a ref and refreshed on theme change.
      const { bg: canvasBg, grid: gridStroke } = themeTokensRef.current;
      ctx.fillStyle = canvasBg;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(75, 75, 160, 0.35)';
        ctx.fill();
      });

      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.12;
            ctx.strokeStyle = `rgba(75, 75, 160, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Respect reduced-motion: draw one static frame instead of animating.
      if (!prefersReducedMotion()) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await sendOTP(email);
      setOtpStep('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please check SMTP settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !otpCode) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOTP(email, otpCode);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google Auth is unconfigured in Supabase console.');
    }
  };

  const handleBypass = async () => {
    await loginBypass(email || 'demo.analyst@auditmind.local');
    navigate('/dashboard');
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      <div className="scanlines absolute inset-0 pointer-events-none z-[1]"></div>

      <button
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-pressed={theme === 'dark'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="absolute top-4 right-4 z-20 p-2 rounded text-text-muted hover:text-text-primary hover:bg-overlay/5 border border-transparent hover:border-overlay/10 precise-transition"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <div className="relative z-10 w-full max-w-md glass-panel p-8 rounded border border-overlay/5 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded bg-background-base border border-accent-cyan/40 text-accent-cyan flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(75,75,160,0.25)]">
            <Shield className="w-6 h-6 animate-pulse" />
          </div>
          <h1 className="font-mono text-2xl font-bold tracking-wider text-text-primary">
            AUDIT<span className="text-accent-cyan">MIND</span>
          </h1>
          <p className="text-text-muted text-xs uppercase font-mono tracking-widest mt-1">
            Contract Compliance Suite
          </p>
        </div>

        {error && (
          <div className="bg-risk-critical/10 border border-risk-critical/30 rounded p-3 text-xs font-mono text-risk-critical mb-4 flex gap-2">
            <Terminal className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {otpStep === 'request' ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-text-secondary uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-text-muted">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@firm.com"
                  className="w-full bg-background-base/80 border border-overlay/10 focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 outline-none rounded py-2 pl-10 pr-4 text-sm font-mono text-text-primary precise-transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 hover:border-accent-cyan text-accent-cyan font-mono text-sm py-2.5 rounded flex items-center justify-center gap-2 precise-transition shadow-[0_0_15px_rgba(75,75,160,0.05)] cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Sending code...' : 'Send Verification OTP'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="bg-risk-low/10 border border-risk-low/20 text-risk-low text-xs p-3 rounded font-mono flex gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 animate-bounce" />
              <span>OTP code sent to {email}. Check your email inbox.</span>
            </div>

            <div>
              <label className="block text-xs font-mono text-text-secondary uppercase tracking-wider mb-2">
                6-Digit OTP Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full tracking-widest text-center bg-background-base/80 border border-overlay/10 focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 outline-none rounded py-2.5 px-4 text-lg font-mono text-text-primary precise-transition"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOtpStep('request')}
                className="w-1/3 bg-overlay/5 hover:bg-overlay/10 border border-overlay/10 text-text-secondary font-mono text-xs py-2.5 rounded precise-transition cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 hover:border-accent-cyan text-accent-cyan font-mono text-sm py-2.5 rounded flex items-center justify-center gap-2 precise-transition cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify & Sign In'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-overlay/5"></div>
          <span className="flex-shrink mx-4 text-text-muted text-[10px] uppercase font-mono tracking-widest">
            or
          </span>
          <div className="flex-grow border-t border-overlay/5"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full mb-3 bg-overlay/5 hover:bg-overlay/10 border border-overlay/10 hover:border-overlay/20 text-text-secondary hover:text-text-primary font-mono text-xs py-2.5 rounded flex items-center justify-center gap-2 precise-transition cursor-pointer"
        >
          <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Sign In with Google
        </button>

        <button
          onClick={handleBypass}
          className="w-full bg-overlay/5 hover:bg-overlay/10 border border-overlay/10 hover:border-overlay/20 text-text-secondary hover:text-text-primary font-mono text-xs py-2 rounded precise-transition cursor-pointer"
        >
          Bypass (Developer Mode)
        </button>
      </div>
    </div>
  );
}
