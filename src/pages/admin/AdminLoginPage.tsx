import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sparkles, Lock, Mail, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';

export const AdminLoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as any)?.from?.pathname || '/admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await login(email, password);
      if (res.user?.platformRole && !location.state?.from) {
        navigate('/platform', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
    try {
      setSubmitting(true);
      setError(null);
      const res = await login(demoEmail, 'Password123!');
      if (res.user?.platformRole && !location.state?.from) {
        navigate('/platform', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Quick login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#09090b] flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient luxury glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-amber-600/5 rounded-full blur-2xl pointer-events-none" />

      {/* Brand Header */}
      <div className="text-center mb-8 relative z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-semibold uppercase tracking-widest mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Management Portal</span>
        </div>
        <h1 className="font-serif-luxury text-3xl sm:text-4xl font-bold text-white tracking-wide">
          AURA Studio
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 max-w-sm mx-auto">
          Sign in to manage visual culinary feeds, instant prices, availability, and multi-tenant menus.
        </p>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chef@auradining.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
          >
            <span>{submitting ? 'Authenticating...' : 'Sign In to Studio'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Demo Roles Quick-Login */}
        <div className="pt-4 border-t border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              Quick Demo Access
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Password123!</span>
          </div>

          {/* Platform SaaS Demo Shortcut */}
          <button
            type="button"
            onClick={() => handleQuickLogin('platformadmin@auramenu.com')}
            className="w-full p-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent hover:bg-amber-500/25 border border-amber-500/40 text-left transition-all group cursor-pointer flex items-center justify-between"
          >
            <div>
              <div className="text-[10px] font-bold uppercase text-amber-300 tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Platform Admin (SaaS Control)</span>
              </div>
              <div className="text-xs font-semibold text-white mt-0.5">
                platformadmin@auramenu.com
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('owner@auradining.com')}
              className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-400/40 text-left transition-all group cursor-pointer"
            >
              <div className="text-[10px] font-bold uppercase text-amber-400 tracking-wider">
                Owner
              </div>
              <div className="text-xs font-medium text-zinc-300 truncate">
                Elena Rostova
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('admin@auradining.com')}
              className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-400/40 text-left transition-all group cursor-pointer"
            >
              <div className="text-[10px] font-bold uppercase text-purple-400 tracking-wider">
                Admin
              </div>
              <div className="text-xs font-medium text-zinc-300 truncate">
                Julian Vance
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('manager@auradining.com')}
              className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-400/40 text-left transition-all group cursor-pointer"
            >
              <div className="text-[10px] font-bold uppercase text-blue-400 tracking-wider">
                Manager
              </div>
              <div className="text-xs font-medium text-zinc-300 truncate">
                Sophie Laurent
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('staff@auradining.com')}
              className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-400/40 text-left transition-all group cursor-pointer"
            >
              <div className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">
                Staff
              </div>
              <div className="text-xs font-medium text-zinc-300 truncate">
                Lucas Moreau
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Security notice footer */}
      <div className="mt-8 text-center text-xs text-zinc-400 flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <span>Secured with JWT, password hashing, and multi-tenant isolation</span>
      </div>
    </div>
  );
};
