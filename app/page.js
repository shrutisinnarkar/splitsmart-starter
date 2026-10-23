'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const INITIAL_MEMBERS = ['Shruti', 'Raj', 'Priya', 'Aisha'];
const SEED = [
  { id: 'seed-1', emoji: '🍽️', name: 'Dinner', paidBy: 'Aisha', sharedWith: ['Shruti', 'Raj', 'Priya', 'Aisha'], amount: 1800 },
  { id: 'seed-2', emoji: '🚕', name: 'Cab', paidBy: 'Raj', sharedWith: ['Shruti', 'Raj'], amount: 400 },
];

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function Home() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [expenses, setExpenses] = useState(SEED);
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [newMember, setNewMember] = useState('');
  const [paidBy, setPaidBy] = useState(INITIAL_MEMBERS[0]);
  const [sharedWith, setSharedWith] = useState(INITIAL_MEMBERS);
  const [showSplit, setShowSplit] = useState(false);
  const [dbError, setDbError] = useState('');
  const [formError, setFormError] = useState('');
  const [loadingDb, setLoadingDb] = useState(false);

  // Check auth session on mount & subscribe to changes
  useEffect(() => {
    let mounted = true;

    async function getSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) {
          setUser(session?.user ?? null);
        }
      } catch (err) {
        if (mounted) setAuthError(err.message);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Fetch expenses from Supabase when user is logged in
  useEffect(() => {
    if (!user) {
      setExpenses(SEED);
      return;
    }

    async function fetchExpenses() {
      setLoadingDb(true);
      setDbError('');
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          const formatted = data.map((item) => ({
            id: item.id,
            emoji: item.emoji || '🧾',
            name: item.name,
            paidBy: item.paid_by || members[0],
            sharedWith: Array.isArray(item.shared_with) ? item.shared_with : (typeof item.shared_with === 'string' ? JSON.parse(item.shared_with) : members),
            amount: Number(item.amount),
          }));
          setExpenses(formatted);
        } else {
          setExpenses([]);
        }
      } catch (err) {
        setDbError('Failed to load expenses from Supabase: ' + err.message);
      } finally {
        setLoadingDb(false);
      }
    }

    fetchExpenses();
  }, [user]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setAuthError('Check your email for the confirmation link, or sign in if confirmation is disabled.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError('');
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
    else setUser(null);
  };

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const addExpense = async () => {
    setFormError('');
    setDbError('');

    const name = expenseName.trim();
    const amount = Number(expenseAmount);

    if (!name) {
      setFormError('Please enter an expense name.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid positive amount.');
      return;
    }

    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
    const chosenPaidBy = paidBy || members[0] || 'Shruti';
    // Use strictly the explicitly selected sharedWith members, or default to all members if none selected
    const chosenSharedWith = sharedWith.length > 0 ? sharedWith : members;

    if (!user) {
      // Local demo mode
      const newExp = {
        id: 'e-' + Date.now(),
        emoji: '🧾',
        name: formattedName,
        paidBy: chosenPaidBy,
        sharedWith: chosenSharedWith,
        amount,
      };
      setExpenses((list) => [...list, newExp]);
      setExpenseName('');
      setExpenseAmount('');
      return;
    }

    // Supabase insert
    try {
      const payload = {
        user_id: user.id,
        name: formattedName,
        emoji: '🧾',
        paid_by: chosenPaidBy,
        shared_with: chosenSharedWith,
        amount,
      };

      const { data, error } = await supabase.from('expenses').insert([payload]).select();
      if (error) throw error;

      if (data && data[0]) {
        const item = data[0];
        const newExp = {
          id: item.id,
          emoji: item.emoji || '🧾',
          name: item.name,
          paidBy: item.paid_by,
          sharedWith: item.shared_with || members,
          amount: Number(item.amount),
        };
        setExpenses((list) => [...list, newExp]);
        setExpenseName('');
        setExpenseAmount('');
      }
    } catch (err) {
      setDbError('Failed to add expense to Supabase: ' + err.message);
    }
  };

  const removeExpense = async (id) => {
    setDbError('');
    if (!user || String(id).startsWith('seed-')) {
      setExpenses((list) => list.filter((e) => e.id !== id));
      return;
    }

    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      setExpenses((list) => list.filter((e) => e.id !== id));
    } catch (err) {
      setDbError('Failed to delete expense from Supabase: ' + err.message);
    }
  };

  const addMember = () => {
    const m = newMember.trim();
    if (!m || members.includes(m)) return;
    const updated = [...members, m];
    setMembers(updated);
    setSharedWith((prev) => [...prev, m]);
    setNewMember('');
  };

  const removeMember = (m) => {
    if (members.length <= 1) return;
    const updated = members.filter((item) => item !== m);
    setMembers(updated);
    if (paidBy === m) setPaidBy(updated[0]);
    setSharedWith((prev) => prev.filter((item) => item !== m));
  };

  const toggleShareWith = (m) => {
    setSharedWith((prev) =>
      prev.includes(m) ? prev.filter((item) => item !== m) : [...prev, m]
    );
  };

  // Calculate balances & settle up
  const balances = {};
  members.forEach((m) => { balances[m] = 0; });

  expenses.forEach((e) => {
    const pBy = e.paidBy;
    const sharers = e.sharedWith && e.sharedWith.length > 0 ? e.sharedWith : members;
    const amt = Number(e.amount || 0);
    if (balances[pBy] !== undefined) {
      balances[pBy] += amt;
    } else {
      balances[pBy] = amt;
    }

    const share = amt / (sharers.length || 1);
    sharers.forEach((s) => {
      if (balances[s] !== undefined) {
        balances[s] -= share;
      } else {
        balances[s] = -share;
      }
    });
  });

  const debtors = [];
  const creditors = [];
  Object.entries(balances).forEach(([person, bal]) => {
    if (bal < -0.01) debtors.push({ person, amount: -bal });
    else if (bal > 0.01) creditors.push({ person, amount: bal });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settleTransactions = [];
  let dIdx = 0;
  let cIdx = 0;
  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const payAmount = Math.min(debtor.amount, creditor.amount);

    settleTransactions.push({
      from: debtor.person,
      to: creditor.person,
      amount: payAmount,
    });

    debtor.amount -= payAmount;
    creditor.amount -= payAmount;

    if (debtor.amount < 0.01) dIdx++;
    if (creditor.amount < 0.01) cIdx++;
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logo}>S</div>
            <div style={styles.title}>Shruti’s SplitSmart</div>
          </div>
          <div style={styles.groupPill}>{user ? 'Cloud Sync' : 'Demo Mode'}</div>
        </div>

        {/* Auth Section */}
        <div style={styles.authBox}>
          {authLoading ? (
            <div style={styles.authInfo}>Loading session…</div>
          ) : user ? (
            <div style={styles.authLoggedIn}>
              <span style={styles.authEmail}>{user.email}</span>
              <button style={styles.authBtn} onClick={handleSignOut}>Sign Out</button>
            </div>
          ) : (
            <form onSubmit={handleAuth} style={styles.authForm}>
              <div style={styles.authTitle}>{isSignUp ? 'Create Supabase Account' : 'Sign In to Supabase'}</div>
              <input
                type="email"
                placeholder="Email address…"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.authInput}
                required
              />
              <input
                type="password"
                placeholder="Password…"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.authInput}
                required
              />
              <div style={styles.authActions}>
                <button type="submit" style={styles.primaryAuthBtn}>
                  {isSignUp ? 'Sign Up' : 'Sign In'}
                </button>
                <button
                  type="button"
                  style={styles.secondaryAuthBtn}
                  onClick={() => setIsSignUp(!isSignUp)}
                >
                  {isSignUp ? 'Have an account? Sign In' : 'Need an account? Sign Up'}
                </button>
              </div>
            </form>
          )}
          {authError && <div style={styles.errorText}>{authError}</div>}
          {dbError && <div style={styles.errorText}>{dbError}</div>}
        </div>

        {/* Group Members Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Group Members ({members.length})</div>
          <div style={styles.memberRow}>
            {members.map((m) => (
              <span key={m} style={styles.memberTag}>
                {m}
                {members.length > 1 && (
                  <button style={styles.memberRemove} onClick={() => removeMember(m)} aria-label={`Remove ${m}`}>×</button>
                )}
              </span>
            ))}
          </div>
          <div style={styles.addRow}>
            <input
              style={styles.input}
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMember()}
              placeholder="Add person name…"
              aria-label="Add person name"
            />
            <button style={styles.addBtn} onClick={addMember} aria-label="Add Member">+</button>
          </div>
        </div>

        {/* Add an expense */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Add Expense {user ? '' : '(Local Demo)'}</div>
          <div style={styles.addExpenseForm}>
            <div style={styles.addRow}>
              <input
                style={styles.input}
                value={expenseName}
                onChange={(e) => setExpenseName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExpense()}
                placeholder="Expense name (e.g. Dinner)…"
                aria-label="Expense name"
              />
              <input
                style={{ ...styles.input, maxWidth: 120 }}
                type="number"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExpense()}
                placeholder="Amount (₹)…"
                aria-label="Amount"
                min="0"
                step="any"
              />
              <button style={styles.addBtn} onClick={addExpense} aria-label="Add Expense">+</button>
            </div>
            {formError && <div style={styles.errorText}>{formError}</div>}

            <div style={styles.optionsGrid}>
              <div style={styles.optionGroup}>
                <label style={styles.label}>Paid by:</label>
                <select
                  style={styles.select}
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                >
                  {members.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div style={styles.optionGroup}>
                <label style={styles.label}>Shared with ({sharedWith.length}):</label>
                <div style={styles.checkboxGroup}>
                  {members.map((m) => (
                    <label key={m} style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={sharedWith.includes(m)}
                        onChange={() => toggleShareWith(m)}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expense list */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Expenses {loadingDb && 'loading…'}</div>
          <div style={styles.list}>
            {expenses.length === 0 && (
              <div style={styles.empty}>No expenses yet — add your first one above.</div>
            )}
            {expenses.map((e) => {
              const sharers = e.sharedWith || members;
              const eachAmount = e.amount / (sharers.length || 1);
              return (
                <div key={e.id} style={styles.item}>
                  <div style={styles.itemEmoji}>{e.emoji}</div>
                  <div style={styles.itemMain}>
                    <div style={styles.itemName}>{e.name}</div>
                    <div style={styles.itemPaid}>
                      Paid by <b>{e.paidBy}</b> • Split among {sharers.join(', ')} ({inr(eachAmount)}/ea)
                    </div>
                  </div>
                  <div style={styles.itemAmount}>{inr(e.amount)}</div>
                  <button style={styles.remove} onClick={() => removeExpense(e.id)} aria-label={`Remove ${e.name}`}>×</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Split Expenses & Settle Up Section */}
        <div style={styles.section}>
          <button
            style={styles.splitToggleBtn}
            onClick={() => setShowSplit(!showSplit)}
          >
            {showSplit ? 'Hide Split & Settle Up' : '⚖️ Split Expenses & Settle Up'}
          </button>

          {showSplit && (
            <div style={styles.splitBox}>
              <div style={styles.subSectionTitle}>Net Balances</div>
              <div style={styles.balanceList}>
                {Object.entries(balances).map(([person, bal]) => (
                  <div key={person} style={styles.balanceItem}>
                    <span>{person}</span>
                    <span style={{ fontWeight: 800, color: bal > 0.01 ? '#2f855a' : bal < -0.01 ? '#c53030' : 'var(--ink)' }}>
                      {bal > 0.01 ? `+${inr(bal)} (Gets back)` : bal < -0.01 ? `${inr(bal)} (Owes)` : 'Settled'}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ ...styles.subSectionTitle, marginTop: 14 }}>Settle Up (Who pays whom)</div>
              {settleTransactions.length === 0 ? (
                <div style={styles.empty}>Everyone is settled up! 🎉</div>
              ) : (
                <div style={styles.settleList}>
                  {settleTransactions.map((tx, idx) => (
                    <div key={idx} style={styles.settleItem}>
                      <b>{tx.from}</b> pays <b>{tx.to}</b> <span style={{ color: 'var(--blue)', fontWeight: 800 }}>{inr(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Total */}
        <div style={styles.total}>Total {inr(total)}</div>
      </div>

      <p style={styles.footnote}>
        Shruti’s SplitSmart · Supabase Database Integration.<br />
        {user ? 'Connected to Supabase with RLS enabled.' : 'Sign in to sync expenses with Supabase.'}
      </p>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '28px 16px 48px',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--card)',
    borderRadius: 24,
    boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)',
    border: '1px solid var(--line)',
    padding: 20,
    marginTop: 12,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: {
    width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center',
    color: '#fff', fontWeight: 800, fontSize: 18,
    background: 'var(--blue)',
    boxShadow: '0 8px 18px -6px rgba(28,95,212,.55)',
  },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' },
  groupPill: {
    fontSize: 12.5, fontWeight: 800, color: 'var(--blue)',
    background: 'rgba(28,95,212,.1)', padding: '6px 12px', borderRadius: 999,
  },
  authBox: { background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 16, padding: 14, marginBottom: 16 },
  authInfo: { fontSize: 13, color: 'var(--muted)', textAlign: 'center' },
  authLoggedIn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 },
  authEmail: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 },
  authBtn: { border: 'none', background: 'var(--line)', color: 'var(--ink)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 },
  authForm: { display: 'flex', flexDirection: 'column', gap: 8 },
  authTitle: { fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 },
  authInput: { border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none', background: '#fff' },
  authActions: { display: 'flex', gap: 8, marginTop: 4 },
  primaryAuthBtn: { flex: 1, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 700 },
  secondaryAuthBtn: { background: 'transparent', color: 'var(--blue)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  errorText: { color: '#e53e3e', fontSize: 12, marginTop: 6, fontWeight: 600 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' },
  memberRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  memberTag: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#eef2f9', color: 'var(--ink)', padding: '4px 10px', borderRadius: 99,
    fontSize: 13, fontWeight: 600, border: '1px solid var(--line)',
  },
  memberRemove: {
    background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1,
  },
  addExpenseForm: { display: 'flex', flexDirection: 'column', gap: 6 },
  addRow: { display: 'flex', gap: 10 },
  input: {
    flex: 1, border: '1px solid var(--line)', borderRadius: 14, padding: '11px 14px',
    fontSize: 14, outline: 'none', background: '#f7f9fc', color: 'var(--ink)',
  },
  addBtn: {
    flex: 'none', width: 44, borderRadius: 14, border: 'none', color: '#fff', fontSize: 22, fontWeight: 700,
    background: 'var(--blue)',
    boxShadow: '0 10px 22px -8px rgba(28,95,212,.6)',
  },
  optionsGrid: { display: 'flex', flexDirection: 'column', gap: 10, background: '#f7f9fc', padding: 12, borderRadius: 14, border: '1px solid var(--line)', marginTop: 8 },
  optionGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 700, color: 'var(--muted)' },
  select: {
    border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px',
    fontSize: 13.5, background: '#fff', color: 'var(--ink)', outline: 'none',
  },
  checkboxGroup: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
  empty: { color: 'var(--muted)', fontSize: '14px', textAlign: 'center', padding: '16px 0' },
  item: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 14px',
  },
  itemEmoji: {
    width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
    background: '#fff', border: '1px solid var(--line)', fontSize: 19, flex: 'none',
  },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { fontWeight: 700, fontSize: 15 },
  itemPaid: { color: 'var(--muted)', fontSize: 12, marginTop: 2, lineHeight: 1.4 },
  itemAmount: { fontWeight: 800, fontSize: 15.5, fontVariantNumeric: 'tabular-nums' },
  remove: {
    flex: 'none', width: 26, height: 26, borderRadius: 8, border: 'none',
    background: 'transparent', color: 'var(--muted)', fontSize: 20, lineHeight: 1,
  },
  splitToggleBtn: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 14,
    border: '1px solid var(--blue)',
    background: 'rgba(28,95,212,0.06)',
    color: 'var(--blue)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center',
    boxShadow: '0 4px 12px -4px rgba(28,95,212,.2)',
  },
  splitBox: {
    marginTop: 10,
    background: '#f7f9fc',
    border: '1px solid var(--line)',
    borderRadius: 16,
    padding: 14,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  },
  balanceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  balanceItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13.5,
    fontWeight: 600,
    background: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid var(--line)',
  },
  settleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  settleItem: {
    background: '#fff',
    padding: '9px 12px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    fontSize: 13.5,
    color: 'var(--ink)',
  },
  total: {
    textAlign: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)',
    fontWeight: 800, fontSize: 16, color: 'var(--ink)',
  },
  footnote: { color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', lineHeight: 1.6, marginTop: 16, maxWidth: 420 },
};
