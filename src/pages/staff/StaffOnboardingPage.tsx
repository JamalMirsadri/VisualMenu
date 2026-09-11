import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  ArrowRight,
  ShieldCheck,
  User,
} from 'lucide-react';
import { staffService } from '../../services/staffService';
import { useAuth } from '../../context/AuthContext';
import type { StaffInvitationValidateResult } from '../../types';

export const StaffOnboardingPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<StaffInvitationValidateResult | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      if (!token) {
        setError('No invitation token provided in the URL.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const data = await staffService.validateStaffInvitation(token);
        setInvitationData(data);
        setFullName(data.invitedName || '');
      } catch (err: any) {
        console.error('Failed to validate staff invitation:', err);
        setError(err.message || 'Invalid, expired, or revoked invitation token.');
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
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
      await staffService.acceptStaffInvitation(token!, {
        password,
        name: fullName.trim() || undefined,
      });

      setIsSuccess(true);
      await refreshProfile();
      setTimeout(() => {
        navigate('/admin');
      }, 1500);
    } catch (err: any) {
      console.error('Failed to accept staff invitation:', err);
      setError(err.message || 'Failed to complete onboarding.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mb-4 mx-auto" />
        <p className="text-xs text-zinc-400 font-mono tracking-wider">
          Validating cryptographic invitation...
        </p>
      </div>
    );
  }

  if (error || !invitationData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-950/80 border border-zinc-800 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
            <AlertCircle className="w-7 h-7" />
          </div>

          <h2 className="text-xl font-serif font-bold text-white tracking-wide mb-2">
            Invalid Invitation
          </h2>

          <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
            {error || 'This invitation link is invalid, expired, or has already been used.'}
          </p>

          <Link
            to="/admin/login"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white font-medium text-xs transition-colors cursor-pointer"
          >
            Go to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-zinc-950/80 border border-zinc-800 rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative z-10">
        {/* Restaurant Header */}
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-zinc-800/80">
          {invitationData.restaurant.logo ? (
            <img
              src={invitationData.restaurant.logo}
              alt="Logo"
              className="w-12 h-12 rounded-full object-cover border border-amber-400/40 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center font-serif text-amber-300 font-bold text-xl shrink-0">
              {invitationData.restaurant.name.charAt(0)}
            </div>
          )}
          <div className="overflow-hidden min-w-0">
            <h1 className="font-serif font-bold text-white text-base tracking-wide truncate">
              {invitationData.restaurant.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-3 h-3 text-amber-400" />
              <span className="text-[11px] text-zinc-400">Team Member Onboarding</span>
            </div>
          </div>
        </div>

        {isSuccess ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-serif font-bold text-white">Welcome to the Team!</h2>
            <p className="text-xs text-zinc-400">
              Your password has been configured and your workplace session is active. Redirecting to your dashboard...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="text-lg font-serif font-bold text-white tracking-wide mb-1">
                Accept Team Invitation
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                You've been invited as{' '}
                <span className="font-semibold text-amber-400 uppercase">
                  {invitationData.role}
                </span>{' '}
                {invitationData.jobTemplate && (
                  <span>
                    ({invitationData.jobTemplate})
                  </span>
                )}
                . Set your credentials below to access your restaurant workspace.
              </p>
            </div>

            {/* Email (Readonly) */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Assigned Email
              </label>
              <input
                type="email"
                readOnly
                value={invitationData.invitedEmail}
                className="w-full text-xs bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-3 py-2 text-zinc-400 cursor-not-allowed select-all"
              />
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Your Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Enter your name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Create Password (min. 8 characters) *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-9 py-2 text-white focus:outline-none focus:border-amber-400"
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

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Confirm Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold text-xs transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {submitting ? (
                <span>Setting up workspace...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Accept Invitation & Enter Workplace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              <Link
                to="/admin/login"
                className="text-[11px] text-zinc-400 hover:text-zinc-300"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
