import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { ArrowRight, Cpu, FileText, Shield } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-redirect if session is active
  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || navigator.hardwareConcurrency < 4) return;

    const ctx = canvas.getContext('2d')!;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const nodes: { x: number; y: number; vx: number; vy: number }[] = [];
    const nodeCount = 50;
    
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    let animationFrameId: number;

    function animate() {
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, width, height);

      // Draw faint technical grids
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.01)';
      ctx.lineWidth = 1;
      const step = 60;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Update positions
      nodes.forEach(node => {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
      });

      // Draw connections
      ctx.strokeStyle = 'rgba(75, 75, 160, 0.15)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      ctx.fillStyle = 'rgba(143, 71, 174, 0.4)';
      nodes.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col justify-between neuro-bg-grid">
      <canvas ref={canvasRef} className="absolute inset-0 -z-10" />
      
      {/* Background Ambient Glows */}
      <div className="absolute top-[15%] left-[5%] w-[450px] h-[450px] ambient-glow-cyan -z-20 pointer-events-none"></div>
      <div className="absolute bottom-[25%] right-[10%] w-[500px] h-[500px] ambient-glow-violet -z-20 pointer-events-none"></div>

      {/* Grid Scanline Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px] pointer-events-none z-1"></div>

      {/* Header */}
      <header className="border-b border-white/5 bg-background-base/20 backdrop-blur-md z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 rounded bg-background-base border border-accent-cyan/25 text-accent-cyan flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.12)]">
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 11H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M12 8V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.5 15H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div className="absolute -inset-0.5 rounded bg-accent-cyan opacity-5 blur-sm"></div>
            </div>
            <span className="font-mono font-bold text-lg tracking-wider text-text-primary">
              AUDIT<span className="text-accent-cyan">MIND</span>
            </span>
          </div>

        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-28 pb-16 z-10 flex-grow flex flex-col justify-center">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent-cyan/20 bg-accent-cyan/5 text-accent-cyan text-xs font-mono mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
            Next-Gen Legal AI Platform
          </div>
          
          <h1 className="display-lg text-[36px] leading-[36px] md:text-[48px] md:leading-[48px] font-normal tracking-[-0.025em] mb-6 text-text-primary uppercase-none">
            Contract risk analysis
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-cyan via-cyan-300 to-indigo-400">
              backed by deep learning.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-text-secondary mb-8 max-w-2xl leading-relaxed body-md">
            Upload any legal agreement. Our neural compliance engine extracts every clause, 
            classifies risk with a fine-tuned transformer model, and grounds analysis in 
            real case law—no prompt wrappers, no guessing.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link to="/login" className="px-6 py-3 rounded bg-accent-cyan hover:bg-accent-cyan/90 text-background-base font-mono font-bold text-sm precise-transition flex items-center gap-2 shadow-[0_0_25px_rgba(0,229,255,0.35)]">
              Start Analysis <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/login" className="px-6 py-3 rounded text-text-primary font-mono text-sm border border-white/10 precise-transition flex items-center glass-button">
              View Demo Report
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-16 z-10">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Cpu,
              title: 'Deep Learning Classification',
              description: 'Local BERT-class transformer inference runs classification scoring on CPU/GPU environments.',
            },
            {
              icon: Shield,
              title: 'Regulation-Grounded RAG',
              description: 'Hybrid vector similarity matches search indexes (pgvector) to fetch matching GDPR, UCC, and CCPA standards.',
            },
            {
              icon: FileText,
              title: 'Annotated Redline Sheets',
              description: 'Exposes plain-English explanations and draft amendments in a premium review panel.',
            },
          ].map((feature, i) => (
            <div key={i} className="p-6 rounded glowing-card">
              <feature.icon className="w-8 h-8 text-accent-cyan mb-4" />
              <h3 className="font-mono text-sm font-semibold text-text-primary uppercase tracking-wider mb-2">{feature.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center text-[10px] font-mono text-text-muted z-10">
        AUDITMIND Compliance Engine // Portions protected by security tokens.
      </footer>
    </div>
  );
}
