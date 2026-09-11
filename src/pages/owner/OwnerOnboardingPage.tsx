import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  UtensilsCrossed,
  Layers,
  Table2,
  CreditCard,
} from 'lucide-react';
import { ownerInvitationService } from '../../services/platformService';
import { useAuth } from '../../context/AuthContext';

export const OwnerOnboardingPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth() as any; // Context helper

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<any | null>(null);

  // Form State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ownerName, setOwnerName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      if (!token) {
        setError('No invitation token provided in URL.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const res = await ownerInvitationService.getInvitation(token);
        setInvitationData(res.data);
        setOwnerName(res.data.invitedName || '');
      } catch (err: any) {
        console.error('Failed to validate invitation token:', err);
        setError(err.message || 'Invalid, expired, or revoked invitation token.');
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await ownerInvitationService.acceptInvitation(token!, {
        password,
        name: ownerName.trim() || undefined,
      });

      // Save token and restaurant context in localStorage
      if (res.data?.token) {
        localStorage.setItem('auth_token', res.data.token);
        if (loginWithToken) {
          await loginWithToken(res.data.token, res.data.user);
        }
      }

      setStep(3); // Setup tour / ready state
    } catch (err: any) {
      console.error('Failed to accept invitation:', err);
      setError(err.message || 'Failed to complete onboarding.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishToAdmin = () => {
    navigate('/admin');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="text-sm text-zinc-400">Verifying secure onboarding invitation...</p>
      </div>
    );
  }

  if (error && !invitationData) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-zinc-900 border border-red-500/30 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
            <AlertCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">Invitation Unavailable</h1>
            <p className="text-xs text-zinc-400 leading-relaxed">{error}</p>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <Link
              to="/admin/login"
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-lg shadow-amber-500/20"
            >
              Go to Restaurant Admin Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { restaurant, invitedEmail } = invitationData;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between py-8 px-4 sm:px-6">
      {/* Top Brand Bar */}
      <div className="max-w-md w-full mx-auto flex items-center justify-center gap-2 text-zinc-400">
        <Building2 className="w-5 h-5 text-amber-400" />
        <span className="font-serif-luxury text-sm font-bold tracking-wider text-white">
          AURA RESTAURANT SUITE
        </span>
      </div>

      <div className="max-w-md w-full mx-auto space-y-6 my-auto py-8">
        {/* Step 1: Welcome & Overview */}
        {step === 1 && (
          <div className="p-8 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-black font-black font-serif text-2xl flex items-center justify-center mx-auto shadow-xl shadow-amber-500/20">
              {restaurant.name.charAt(0).toUpperCase()}
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                Exclusive Owner Invitation
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Welcome to {restaurant.name}
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                You have been designated as the primary <strong className="text-white">OWNER</strong> for
                this restaurant. Activate your account below to begin designing your menu and operating your dining rooms.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Invited Email:</span>
                <span className="text-zinc-300 font-mono">{invitedEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Public Menu URL:</span>
                <span className="text-amber-400 font-mono">/menu/{restaurant.slug}</span>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-xl shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Set Up Your Account & Password</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Set Password */}
        {step === 2 && (
          <div className="p-8 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-2xl space-y-6">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                Step 2 of 2
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight mt-1">
                Create Secure Password
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Set the password you will use to log into your restaurant console.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white focus:outline-none focus:border-amber-500/50 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  New Password (min 8 characters)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white focus:outline-none focus:border-amber-500/50 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white focus:outline-none focus:border-amber-500/50 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 mt-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-xl shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Activating Account...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Complete Activation & Sign In</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Step 3: Setup Tour & Launch */}
        {step === 3 && (
          <div className="p-8 rounded-3xl bg-zinc-900/90 border border-emerald-500/40 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                Setup Complete
              </span>
              <h2 className="text-2xl font-bold text-white font-serif">
                You're Ready to Build
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Your restaurant is currently initialized with a clean state. Follow the quick guide in
                your dashboard to add categories, foods, media, and tables.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left text-xs">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-2.5">
                <UtensilsCrossed className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-zinc-300">1. Menu & Foods</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="text-zinc-300">2. Media Library</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-2.5">
                <Table2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-zinc-300">3. Tables & QR</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-zinc-300">4. Payments & POS</span>
              </div>
            </div>

            <button
              onClick={handleFinishToAdmin}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-xl shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Enter Restaurant Admin Console</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-zinc-600">
        © 2026 Aura SaaS • Independent Multi-Tenant Restaurant System
      </div>
    </div>
  );
};
