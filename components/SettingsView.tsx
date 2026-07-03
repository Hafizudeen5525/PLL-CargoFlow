import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'react-hot-toast';

import { UserManagement } from './UserManagement';

interface SettingsViewProps {
  user: User;
  userRole: 'admin' | 'trader' | 'viewer';
  testRole: 'admin' | 'trader' | 'viewer' | null;
  setTestRole: (role: 'admin' | 'trader' | 'viewer' | null) => void;
  preferredYear: string;
  onSetPreferredYear: (year: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  user, 
  userRole, 
  testRole,
  setTestRole,
  preferredYear, 
  onSetPreferredYear 
}) => {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">System Settings</h2>
        <p className="text-slate-500 text-sm">Manage your profile, organization roles, and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile & Prefs */}
        <div className="lg:col-span-1 space-y-6">
          {/* Admin Role Tester (Moved from sidebar) */}
          {userRole === 'admin' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                  <h3 className="font-bold text-indigo-900 text-sm">Admin Role Tester</h3>
                </div>
                {testRole && (
                  <button 
                    onClick={() => setTestRole(null)}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-600 underline"
                  >
                    Reset to Admin
                  </button>
                )}
              </div>
              <p className="text-xs text-indigo-600 mb-4 leading-relaxed">
                As an admin, you can temporarily switch your session role to test the interface as a different user type.
              </p>
              <div className="flex bg-indigo-100/50 p-1 rounded-xl gap-1">
                {(['trader', 'viewer'] as const).map(r => (
                  <button 
                    key={r}
                    onClick={() => setTestRole(r)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg capitalize transition-all ${testRole === r ? 'bg-white text-indigo-600 shadow-md transform scale-[1.02]' : 'text-indigo-400 hover:text-indigo-600'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Profile Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
          >
            <div className="flex items-center gap-4 mb-6">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-16 h-16 rounded-full border-4 border-slate-50" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 flex items-center justify-center rounded-full text-2xl font-bold">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="font-bold text-slate-800">{user.displayName || 'Team Member'}</h3>
                <p className="text-sm text-slate-500">{user.email}</p>
                <div className={`mt-1.5 inline-block text-[10px] font-black px-2 py-0.5 rounded border ${userRole === 'admin' ? 'text-red-600 bg-red-50 border-red-100' : 'text-indigo-600 bg-indigo-50 border-indigo-100'} uppercase`}>
                  {userRole}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Default Portfolio Year</label>
                <select 
                  value={preferredYear}
                  onChange={(e) => onSetPreferredYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="All">All Years</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
                <p className="mt-2 text-[10px] text-slate-400 italic">This will be your default view when you login.</p>
              </div>
            </div>
          </motion.div>

          {/* Org Info */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-100"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white/20 p-2 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <h3 className="font-bold">Organization Data</h3>
            </div>
            <p className="text-sm text-indigo-100 leading-relaxed mb-4">
              Cargoes marked as "Shared" are visible to all members of your organization. Admins and the original creator can edit these records.
            </p>
            <div className="flex items-center gap-2 text-xs bg-black/10 p-3 rounded-xl border border-white/10">
              <svg className="w-4 h-4 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Sharing is enabled for this workspace.</span>
            </div>
          </motion.div>
        </div>

        {/* Right Column: User Management (Admin Only) */}
        <div className="lg:col-span-2">
          {userRole !== 'admin' ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl h-full flex flex-col items-center justify-center p-12 text-center">
              <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <h4 className="font-bold text-slate-800 mb-1">Admin Access Required</h4>
              <p className="text-slate-500 text-sm max-w-xs">User management and role assignments can only be performed by system administrators.</p>
            </div>
          ) : (
            <UserManagement />
          )}
        </div>
      </div>
    </div>
  );
};
