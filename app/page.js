'use client';

import { useEffect, useState } from 'react';

const INITIAL_MEMBERS = ['Shruti', 'Raj', 'Priya', 'Aisha'];
const SEED = [
  { id: 'seed-1', emoji: '🍽️', name: 'Dinner', paidBy: 'Aisha', sharedWith: ['Shruti', 'Raj', 'Priya', 'Aisha'], amount: 1800 },
  { id: 'seed-2', emoji: '🚕', name: 'Cab', paidBy: 'Raj', sharedWith: ['Shruti', 'Raj'], amount: 400 },
];

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

function parseExpense(text, members, paidBy, sharedWith) {
  const amountMatch = text.match(/\d[\d,]*(\.\d+)?/);
  const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
  const name = text.replace(/\d[\d,]*(\.\d+)?/, '').replace(/\s+/g, ' ').trim() || 'Expense';
  return {
    id: 'e-' + Date.now(),
    emoji: '🧾',
    name: name.charAt(0).toUpperCase() + name.slice(1),
    paidBy: paidBy || members[0] || 'Shruti',
    sharedWith: sharedWith.length > 0 ? sharedWith : members,
    amount,
  };
}

export default function Home() {
  const [expenses, setExpenses] = useState(SEED);
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [text, setText] = useState('');
  const [newMember, setNewMember] = useState('');
  const [paidBy, setPaidBy] = useState(INITIAL_MEMBERS[0]);
  const [sharedWith, setSharedWith] = useState(INITIAL_MEMBERS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const savedExp = localStorage.getItem('splitsmart.expenses');
      if (savedExp) setExpenses(JSON.parse(savedExp));
      const savedMem = localStorage.getItem('splitsmart.members');
      if (savedMem) {
        const parsed = JSON.parse(savedMem);
        setMembers(parsed);
        setPaidBy(parsed[0]);
        setSharedWith(parsed);
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem('splitsmart.expenses', JSON.stringify(expenses));
        localStorage.setItem('splitsmart.members', JSON.stringify(members));
      } catch {}
    }
  }, [expenses, members, ready]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const addExpense = () => {
    const t = text.trim();
    if (!t) return;
    setExpenses((list) => [...list, parseExpense(t, members, paidBy, sharedWith)]);
    setText('');
  };

  const removeExpense = (id) => setExpenses((list) => list.filter((e) => e.id !== id));

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

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logo}>S</div>
            <div style={styles.title}>Shruti’s SplitSmart</div>
          </div>
          <div style={styles.groupPill}>My Group</div>
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
          <div style={styles.sectionTitle}>Add Expense</div>
          <div style={styles.addRow}>
            <input
              style={styles.input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addExpense()}
              placeholder="e.g. Dinner 1800…"
              aria-label="Add an expense"
            />
            <button style={styles.addBtn} onClick={addExpense} aria-label="Add Expense">+</button>
          </div>

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

        {/* Expense list */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Expenses</div>
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

        {/* Total */}
        <div style={styles.total}>Total {inr(total)}</div>
      </div>

      <p style={styles.footnote}>
        Shruti’s SplitSmart · deepEntra Academy — Build &amp; Ship It.<br />
        Advanced splitting and member management enabled.
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
  addRow: { display: 'flex', gap: 10, marginBottom: 10 },
  input: {
    flex: 1, border: '1px solid var(--line)', borderRadius: 14, padding: '11px 14px',
    fontSize: 14, outline: 'none', background: '#f7f9fc', color: 'var(--ink)',
  },
  addBtn: {
    flex: 'none', width: 44, borderRadius: 14, border: 'none', color: '#fff', fontSize: 22, fontWeight: 700,
    background: 'var(--blue)',
    boxShadow: '0 10px 22px -8px rgba(28,95,212,.6)',
  },
  optionsGrid: { display: 'flex', flexDirection: 'column', gap: 10, background: '#f7f9fc', padding: 12, borderRadius: 14, border: '1px solid var(--line)' },
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
  total: {
    textAlign: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)',
    fontWeight: 800, fontSize: 16, color: 'var(--ink)',
  },
  footnote: { color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', lineHeight: 1.6, marginTop: 16, maxWidth: 420 },
};
