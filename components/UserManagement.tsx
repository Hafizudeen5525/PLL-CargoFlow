
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { toast } from 'react-hot-toast';

interface UserData {
  uid: string;
  email: string;
  role: 'admin' | 'trader' | 'viewer';
  displayName?: string;
  photoURL?: string;
  lastLogin?: string;
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>(() => 
    !isFirebaseConfigured ? [{ uid: 'guest_user', email: 'guest@cargoflow.local', role: 'admin', displayName: 'Guest Trader', lastLogin: new Date().toISOString() }] : []
  );
  const [loading, setLoading] = useState(!isFirebaseConfigured ? false : true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => d.data() as UserData);
      setUsers(docs.sort((a, b) => (a.email || '').localeCompare(b.email || '')));
      setLoading(false);
    }, (err) => {
      console.warn("Error fetching users (local mode active):", err);
      setUsers([
        { uid: 'guest_user', email: 'guest@cargoflow.local', role: 'admin', displayName: 'Guest Trader', lastLogin: new Date().toISOString() }
      ]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleRoleChange = async (uid: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      toast.success(`User role updated to ${newRole}`);
    } catch (err) {
      toast.error("Failed to update role. Permission denied.");
    }
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Team Management</h2>
          <p className="text-xs text-slate-500">Manage organizational members and their access levels</p>
        </div>
        <div className="relative">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input 
            type="text" 
            placeholder="Search users..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-full sm:w-64 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">User Details</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">System Role</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Activity</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-lg">
                            {u.email?.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-slate-800 truncate">{u.displayName || 'Unnamed user'}</span>
                        <span className="text-[10px] text-slate-400 truncate">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                      u.role === 'admin' ? 'bg-rose-50 text-rose-700 border-rose-100' : 
                      u.role === 'trader' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                      'bg-indigo-50 text-indigo-700 border-indigo-100'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <select 
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.uid, e.target.value as any)}
                      className="bg-white border border-slate-200 rounded-lg text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <option value="admin">Admin</option>
                      <option value="trader">Trader</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm animate-pulse">
                    Synchronizing team state...
                  </td>
                </tr>
              )}
              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">
                    No matching members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
