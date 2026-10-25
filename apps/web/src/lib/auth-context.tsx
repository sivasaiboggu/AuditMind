import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { useContractStore } from '../store/contractStore';

interface User {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  sendOTP: (email: string) => Promise<void>;
  verifyOTP: (email: string, code: string) => Promise<void>;
  loginBypass: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const authEpoch = useRef(0);
  const applyUser = (next: User | null) => {
    useContractStore.getState().setUser(next);
    setUser(next);
  };

  const syncProfile = async (supabaseUser: any, epoch: number) => {
    const fallback: User = { id: supabaseUser.id, email: supabaseUser.email || '',
      fullName: supabaseUser.user_metadata?.full_name || '',
      avatarUrl: supabaseUser.user_metadata?.avatar_url || '' };
    // Change ownership before awaiting profile details, clearing private state.
    if (epoch !== authEpoch.current) return;
    applyUser(fallback);
    try {
      const { data } = await supabase!.from('profiles').select('*').eq('id', supabaseUser.id).single();
      if (epoch !== authEpoch.current) return;
      applyUser(data ? { ...fallback, fullName: data.full_name || '', avatarUrl: data.avatar_url || '' } : fallback);
    } catch { /* Keep only the current authenticated user's fallback profile. */ }
    if (epoch === authEpoch.current) setLoading(false);
  };

  useEffect(() => {
    let disposed = false;
    if (!supabase) {
      // Demo storage is not authentication. Never use it with configured auth.
      try {
        const saved = JSON.parse(localStorage.getItem('auditmind_user') || 'null');
        if (saved && typeof saved.id === 'string' && typeof saved.email === 'string') applyUser(saved);
        else applyUser(null);
      } catch { applyUser(null); }
      setLoading(false);
      return () => { ++authEpoch.current; };
    }
    const initialEpoch = ++authEpoch.current;
    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (disposed || authEpoch.current !== initialEpoch) return;
      if (error) { applyUser(null); setLoading(false); return; }
      if (session?.user) void syncProfile(session.user, initialEpoch);
      else { applyUser(null); setLoading(false); }
    }).catch(() => {
      if (!disposed && authEpoch.current === initialEpoch) { applyUser(null); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const epoch = ++authEpoch.current;
      if (disposed) return;
      if (session?.user) {
        // Avoid awaiting database work inside the auth event callback.
        void syncProfile(session.user, epoch);
      } else { applyUser(null); setLoading(false); }
    });
    return () => { disposed = true; ++authEpoch.current; subscription.unsubscribe(); };
  }, []);

  const loginWithGoogle = async () => {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard'
      }
    });
    if (error) throw error;
  };

  const sendOTP = async (email: string) => {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true
      }
    });
    if (error) throw error;
  };

  const verifyOTP = async (email: string, code: string) => {
    if (!supabase) throw new Error('Supabase client not initialized');
    const epoch = ++authEpoch.current;
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email'
    });
    if (error) throw error;
    if (epoch !== authEpoch.current) return;
    if (data.user) {
      await syncProfile(data.user, epoch);
    }
  };

  const loginBypass = async (email: string) => {
    const mockUser: User = {
      id: '00000000-0000-0000-0000-000000000000',
      email,
      fullName: 'Demo Analyst',
      avatarUrl: ''
    };
    if (supabase) throw new Error('Demo login is unavailable when authentication is configured.');
    ++authEpoch.current;
    applyUser(mockUser);
    localStorage.setItem('auditmind_user', JSON.stringify(mockUser));
  };

  const logout = async () => {
    ++authEpoch.current;
    useContractStore.getState().resetWorkspace();
    setUser(null);
    try { localStorage.removeItem('auditmind_user'); } catch {}
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error('Local workspace cleared, but remote sign-out failed. Sign out again before using a shared device.');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, sendOTP, verifyOTP, loginBypass, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
