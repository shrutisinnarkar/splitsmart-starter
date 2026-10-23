'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function Home() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  // Groups state
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [groupError, setGroupError] = useState('');
  const [groupSuccess, setGroupSuccess] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Active view tab: 'dashboard' | 'expenses' | 'groups' | 'settlements'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Group data state
  const [expenses, setExpenses] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [dbError, setDbError] = useState('');

  // Add expense form state
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [sharedWith, setSharedWith] = useState([]);
  const [formError, setFormError] = useState('');

  // 1. Auth session on mount
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

  // 2. Fetch user's groups when authenticated
  useEffect(() => {
    if (!user) {
      setGroups([]);
      setActiveGroup(null);
      return;
    }

    async function fetchUserGroups() {
      setLoadingGroups(true);
      setGroupError('');
      try {
        // Query group_members joined with groups
        const { data, error } = await supabase
          .from('group_members')
          .select('group_id, groups(id, name, join_code, created_by, created_at)')
          .eq('user_id', user.id);

        if (error) throw error;

        const fetchedGroups = (data || [])
          .map((item) => item.groups)
          .filter(Boolean);

        setGroups(fetchedGroups);

        // Set active group if not already set or if active group no longer in list
        if (fetchedGroups.length > 0) {
          setActiveGroup((prev) => {
            if (!prev || !fetchedGroups.some((g) => g.id === prev.id)) {
              return fetchedGroups[0];
            }
            return prev;
          });
        } else {
          setActiveGroup(null);
        }
      } catch (err) {
        setGroupError('Failed to load groups: ' + err.message);
      } finally {
        setLoadingGroups(false);
      }
    }

    fetchUserGroups();
  }, [user]);

  // 3. Fetch expenses and group members when activeGroup changes
  useEffect(() => {
    if (!user || !activeGroup) {
      setExpenses([]);
      setGroupMembers([]);
      return;
    }

    async function fetchGroupData() {
      setLoadingDb(true);
      setDbError('');
      try {
        // Fetch group members from group_members (and user emails if available or map user IDs)
        const { data: memberData, error: memberError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', activeGroup.id);

        if (memberError) throw memberError;

        // Extract member identifiers (using user email if available, or user id prefix)
        // Since we can't always read auth.users directly without an RPC/profile table, we use user id or email if stored, or fallback to user IDs / email mapping
        const membersList = (memberData || []).map((m) => {
          // If the member is the current user, show their email or 'You'/'Creator', else fallback to short ID
          if (m.user_id === user.id) return user.email || 'You';
          return 'User ' + m.user_id.substring(0, 6);
        });

        // Ensure unique members and ensure current user is included
        const uniqueMembers = Array.from(new Set(membersList));
        if (uniqueMembers.length === 0) uniqueMembers.push(user.email || 'You');
        setGroupMembers(uniqueMembers);
        setPaidBy(uniqueMembers[0]);
        setSharedWith(uniqueMembers);

        // Fetch expenses for active group
        const { data: expData, error: expError } = await supabase
          .from('expenses')
          .select('*')
          .eq('group_id', activeGroup.id)
          .order('created_at', { ascending: false });

        if (expError) throw expError;

        const formattedExpenses = (expData || []).map((item) => ({
          id: item.id,
          emoji: item.emoji || '🧾',
          name: item.name,
          paidBy: item.paid_by || uniqueMembers[0],
          sharedWith: Array.isArray(item.shared_with) ? item.shared_with : (typeof item.shared_with === 'string' ? JSON.parse(item.shared_with) : uniqueMembers),
          amount: Number(item.amount),
        }));

        setExpenses(formattedExpenses);
      } catch (err) {
        setDbError('Failed to load group data: ' + err.message);
      } finally {
        setLoadingDb(false);
      }
    }

    fetchGroupData();
  }, [user, activeGroup]);

  // Auth actions
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

  // Group actions
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setGroupError('');
    setGroupSuccess('');
    const gName = newGroupName.trim();
    if (!gName) {
      setGroupError('Please enter a group name.');
      return;
    }

    try {
      // 1. Insert into groups
      const { data: groupData, error: groupErr } = await supabase
        .from('groups')
        .insert([{ name: gName, created_by: user.id }])
        .select()
        .single();

      if (groupErr) throw groupErr;

      const newGroup = groupData;

      // 2. Automatically add creator to group_members
      const { error: memberErr } = await supabase
        .from('group_members')
        .insert([{ group_id: newGroup.id, user_id: user.id }]);

      if (memberErr) {
        // Handle partial failure honestly with recovery message
        setGroupError(`Group created, but automatic membership failed: ${memberErr.message}. Please try joining via join code.`);
        return;
      }

      setGroupSuccess(`Group "${newGroup.name}" created successfully! Join code: ${newGroup.join_code}`);
      setNewGroupName('');

      // Refresh groups list
      setGroups((prev) => [newGroup, ...prev]);
      setActiveGroup(newGroup);
    } catch (err) {
      setGroupError('Failed to create group: ' + err.message);
    }
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    setGroupError('');
    setGroupSuccess('');
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      setGroupError('Please enter a join code.');
      return;
    }

    try {
      // Call Supabase RPC join_group(code)
      const { data, error } = await supabase.rpc('join_group', { code });
      if (error) throw error;

      setGroupSuccess('Successfully joined group!');
      setJoinCodeInput('');

      // Refresh groups
      const { data: memberData, error: memErr } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name, join_code, created_by, created_at)')
        .eq('user_id', user.id);

      if (!memErr && memberData) {
        const fetchedGroups = memberData.map((item) => item.groups).filter(Boolean);
        setGroups(fetchedGroups);
        const joinedGroup = fetchedGroups.find((g) => g.join_code === code);
        if (joinedGroup) setActiveGroup(joinedGroup);
      }
    } catch (err) {
      setGroupError('Failed to join group (invalid code or already a member): ' + err.message);
    }
  };

  const copyJoinCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Expense CRUD actions
  const addExpense = async () => {
    setFormError('');
    setDbError('');

    if (!activeGroup) {
      setFormError('Please select or create an active group first.');
      return;
    }

    const name = expenseName.trim();
    const amount = Number(expenseAmount);

    if (!name) {
      setFormError('Please enter an expense description.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid positive amount.');
      return;
    }

    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
    const chosenPaidBy = paidBy || groupMembers[0] || (user.email || 'You');
    const chosenSharedWith = sharedWith.length > 0 ? sharedWith : groupMembers;

    try {
      const payload = {
        group_id: activeGroup.id,
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
          sharedWith: item.shared_with || groupMembers,
          amount: Number(item.amount),
        };
        setExpenses((list) => [newExp, ...list]);
        setExpenseName('');
        setExpenseAmount('');
      }
    } catch (err) {
      setDbError('Failed to add expense: ' + err.message);
    }
  };

  const removeExpense = async (id) => {
    setDbError('');
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .eq('group_id', activeGroup.id);

      if (error) throw error;
      setExpenses((list) => list.filter((e) => e.id !== id));
    } catch (err) {
      setDbError('Failed to delete expense: ' + err.message);
    }
  };

  const toggleShareWith = (m) => {
    setSharedWith((prev) =>
      prev.includes(m) ? prev.filter((item) => item !== m) : [...prev, m]
    );
  };

  // Calculations for active group
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const balances = {};
  groupMembers.forEach((m) => { balances[m] = 0; });

  expenses.forEach((e) => {
    const pBy = e.paidBy;
    const sharers = e.sharedWith && e.sharedWith.length > 0 ? e.sharedWith : groupMembers;
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

  // Find current user's net balance if they are in groupMembers
  const currentUserIdentifier = user ? (user.email || 'You') : '';
  const myNetBalance = balances[currentUserIdentifier] !== undefined ? balances[currentUserIdentifier] : 0;

  if (authLoading) {
    return (
      <main style={styles.centerScreen}>
        <div style={styles.loadingCard}>Loading SplitSmart…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={styles.authScreen}>
        <div style={styles.authCard}>
          <div style={styles.brandRow}>
            <div style={styles.logo}>S</div>
            <h1 style={styles.authHeading}>SplitSmart</h1>
          </div>
          <p style={styles.authSub}>Collaborative expense splitting for groups, roommates, and trips.</p>

          <form onSubmit={handleAuth} style={styles.authForm}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={styles.input}
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={styles.input}
                required
              />
            </div>

            <button type="submit" style={styles.primaryBtn}>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>

            <button
              type="button"
              style={styles.linkBtn}
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
            </button>
          </form>

          {authError && <div style={styles.errorBox}>{authError}</div>}
        </div>
      </main>
    );
  }

  return (
    <div style={styles.dashboardLayout}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarBrand}>
          <div style={styles.logo}>S</div>
          <span style={styles.sidebarTitle}>SplitSmart</span>
        </div>

        <nav style={styles.navMenu}>
          <button
            style={{ ...styles.navItem, ...(activeTab === 'dashboard' ? styles.navItemActive : {}) }}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            style={{ ...styles.navItem, ...(activeTab === 'expenses' ? styles.navItemActive : {}) }}
            onClick={() => setActiveTab('expenses')}
          >
            💳 Expenses
          </button>
          <button
            style={{ ...styles.navItem, ...(activeTab === 'groups' ? styles.navItemActive : {}) }}
            onClick={() => setActiveTab('groups')}
          >
            👥 Groups ({groups.length})
          </button>
          <button
            style={{ ...styles.navItem, ...(activeTab === 'settlements' ? styles.navItemActive : {}) }}
            onClick={() => setActiveTab('settlements')}
          >
            ⚖️ Settlements
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <span style={styles.userEmailText} title={user.email}>{user.email}</span>
          </div>
          <button style={styles.logoutBtn} onClick={handleSignOut}>Sign Out</button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={styles.mainContent}>
        {/* Top Header */}
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <h2 style={styles.pageTitle}>
              {activeTab === 'dashboard' && 'Dashboard Overview'}
              {activeTab === 'expenses' && 'Group Expenses'}
              {activeTab === 'groups' && 'Manage Groups'}
              {activeTab === 'settlements' && 'Settle Up & Balances'}
            </h2>
          </div>

          <div style={styles.headerRight}>
            {groups.length > 0 ? (
              <div style={styles.groupSelectorWrapper}>
                <span style={styles.selectorLabel}>Active Group:</span>
                <select
                  style={styles.groupSelect}
                  value={activeGroup ? activeGroup.id : ''}
                  onChange={(e) => {
                    const found = groups.find((g) => g.id === e.target.value);
                    if (found) setActiveGroup(found);
                  }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <button style={styles.headerActionBtn} onClick={() => setActiveTab('groups')}>
                + Create or Join Group
              </button>
            )}
          </div>
        </header>

        {/* View Content */}
        <div style={styles.contentScroll}>
          {dbError && <div style={styles.errorBox}>{dbError}</div>}
          {groupError && <div style={styles.errorBox}>{groupError}</div>}
          {groupSuccess && <div style={styles.successBox}>{groupSuccess}</div>}

          {/* No Groups Empty State */}
          {groups.length === 0 ? (
            <div style={styles.emptyGroupCard}>
              <div style={styles.emptyIcon}>🏠</div>
              <h3 style={styles.emptyHeading}>No Groups Found</h3>
              <p style={styles.emptyText}>You are not a member of any expense group yet. Create your first group or join one using a join code.</p>
              <div style={styles.emptyActionRow}>
                <button style={styles.primaryBtn} onClick={() => setActiveTab('groups')}>
                  Get Started → Create / Join Group
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* DASHBOARD TAB */}
              {activeTab === 'dashboard' && (
                <div style={styles.dashboardGrid}>
                  {/* Active Group Banner / Card */}
                  {activeGroup && (
                    <div style={styles.groupCardBanner}>
                      <div>
                        <span style={styles.badge}>Active Group</span>
                        <h3 style={styles.groupBannerTitle}>{activeGroup.name}</h3>
                        <p style={styles.groupBannerSub}>Join Code: <b>{activeGroup.join_code}</b></p>
                      </div>
                      <button
                        style={styles.secondaryBtn}
                        onClick={() => copyJoinCode(activeGroup.join_code)}
                      >
                        {copiedCode ? 'Copied! ✓' : '📋 Copy Join Code'}
                      </button>
                    </div>
                  )}

                  {/* Summary Metric Cards */}
                  <div style={styles.metricsGrid}>
                    <div style={styles.metricCard}>
                      <span style={styles.metricIcon}>💰</span>
                      <div style={styles.metricLabel}>Total Group Expenses</div>
                      <div style={styles.metricValue}>{inr(totalExpenses)}</div>
                    </div>
                    <div style={styles.metricCard}>
                      <span style={styles.metricIcon}>👥</span>
                      <div style={styles.metricLabel}>Group Members</div>
                      <div style={styles.metricValue}>{groupMembers.length}</div>
                    </div>
                    <div style={styles.metricCard}>
                      <span style={styles.metricIcon}>⚖️</span>
                      <div style={styles.metricLabel}>Your Net Balance</div>
                      <div style={{ ...styles.metricValue, color: myNetBalance > 0.01 ? '#16a34a' : myNetBalance < -0.01 ? '#dc2626' : 'var(--ink)' }}>
                        {myNetBalance > 0 ? `+${inr(myNetBalance)}` : inr(myNetBalance)}
                      </div>
                    </div>
                    <div style={styles.metricCard}>
                      <span style={styles.metricIcon}>🤝</span>
                      <div style={styles.metricLabel}>Pending Settlements</div>
                      <div style={styles.metricValue}>{settleTransactions.length}</div>
                    </div>
                  </div>

                  {/* Quick Actions & Recent Expenses */}
                  <div style={styles.dashboardTwoColumn}>
                    <div style={styles.card}>
                      <h3 style={styles.sectionHeading}>⚡ Quick Actions</h3>
                      <div style={styles.quickActionsList}>
                        <button style={styles.actionRowBtn} onClick={() => setActiveTab('expenses')}>
                          <span>💳 Add New Expense</span>
                          <span>→</span>
                        </button>
                        <button style={styles.actionRowBtn} onClick={() => setActiveTab('settlements')}>
                          <span>⚖️ View Settle Up Plan</span>
                          <span>→</span>
                        </button>
                        <button style={styles.actionRowBtn} onClick={() => setActiveTab('groups')}>
                          <span>👥 Invite Members / Join Group</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>

                    <div style={styles.card}>
                      <h3 style={styles.sectionHeading}>🧾 Recent Expenses</h3>
                      {expenses.length === 0 ? (
                        <p style={styles.mutedText}>No expenses recorded in this group yet.</p>
                      ) : (
                        <div style={styles.miniExpenseList}>
                          {expenses.slice(0, 4).map((e) => (
                            <div key={e.id} style={styles.miniExpenseItem}>
                              <div>
                                <div style={styles.miniExpName}>{e.name}</div>
                                <div style={styles.miniExpMeta}>Paid by {e.paidBy}</div>
                              </div>
                              <div style={styles.miniExpAmount}>{inr(e.amount)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* EXPENSES TAB */}
              {activeTab === 'expenses' && (
                <div style={styles.sectionContainer}>
                  {/* Add Expense Form Card */}
                  <div style={styles.card}>
                    <h3 style={styles.sectionHeading}>Add New Expense</h3>
                    <div style={styles.formGrid}>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Description</label>
                        <input
                          type="text"
                          value={expenseName}
                          onChange={(e) => setExpenseName(e.target.value)}
                          placeholder="e.g. Dinner, Cab, Groceries"
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Amount (₹)</label>
                        <input
                          type="number"
                          value={expenseAmount}
                          onChange={(e) => setExpenseAmount(e.target.value)}
                          placeholder="0.00"
                          style={styles.input}
                          min="0"
                          step="any"
                        />
                      </div>
                    </div>

                    <div style={styles.formGridTwo}>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Paid By</label>
                        <select
                          style={styles.select}
                          value={paidBy}
                          onChange={(e) => setPaidBy(e.target.value)}
                        >
                          {groupMembers.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.label}>Shared With ({sharedWith.length})</label>
                        <div style={styles.checkboxGroup}>
                          {groupMembers.map((m) => (
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

                    {formError && <div style={styles.errorBox}>{formError}</div>}

                    <button style={styles.primaryBtn} onClick={addExpense}>
                      + Add Expense to Group
                    </button>
                  </div>

                  {/* Expense List Card */}
                  <div style={styles.card}>
                    <h3 style={styles.sectionHeading}>Group Expenses ({expenses.length})</h3>
                    {expenses.length === 0 ? (
                      <p style={styles.mutedText}>No expenses recorded yet. Add your first expense above!</p>
                    ) : (
                      <div style={styles.expenseTable}>
                        {expenses.map((e) => {
                          const sharers = e.sharedWith || groupMembers;
                          const eachAmt = e.amount / (sharers.length || 1);
                          return (
                            <div key={e.id} style={styles.expenseRowItem}>
                              <div style={styles.expEmojiBox}>{e.emoji}</div>
                              <div style={styles.expDetails}>
                                <div style={styles.expName}>{e.name}</div>
                                <div style={styles.expSub}>
                                  Paid by <b>{e.paidBy}</b> • Split among {sharers.join(', ')} ({inr(eachAmt)}/ea)
                                </div>
                              </div>
                              <div style={styles.expAmount}>{inr(e.amount)}</div>
                              <button
                                style={styles.deleteBtn}
                                onClick={() => removeExpense(e.id)}
                                title="Delete expense"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* GROUPS TAB */}
              {activeTab === 'groups' && (
                <div style={styles.sectionContainer}>
                  <div style={styles.groupsGridTwo}>
                    {/* Create Group Card */}
                    <div style={styles.card}>
                      <h3 style={styles.sectionHeading}>Create a New Group</h3>
                      <form onSubmit={handleCreateGroup}>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Group Name</label>
                          <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="e.g. Goa Trip 2026, Apartment 4B"
                            style={styles.input}
                            required
                          />
                        </div>
                        <button type="submit" style={styles.primaryBtn}>
                          Create Group
                        </button>
                      </form>
                    </div>

                    {/* Join Group Card */}
                    <div style={styles.card}>
                      <h3 style={styles.sectionHeading}>Join Group with Code</h3>
                      <form onSubmit={handleJoinGroup}>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Join Code</label>
                          <input
                            type="text"
                            value={joinCodeInput}
                            onChange={(e) => setJoinCodeInput(e.target.value)}
                            placeholder="e.g. A3F8K2"
                            style={styles.input}
                            required
                          />
                        </div>
                        <button type="submit" style={styles.secondaryBtnWide}>
                          Join Group
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* My Groups List Card */}
                  <div style={styles.card}>
                    <h3 style={styles.sectionHeading}>Your Groups</h3>
                    <div style={styles.groupListContainer}>
                      {groups.map((g) => {
                        const isActive = activeGroup && activeGroup.id === g.id;
                        return (
                          <div
                            key={g.id}
                            style={{ ...styles.groupListItem, ...(isActive ? styles.groupListItemActive : {}) }}
                          >
                            <div>
                              <div style={styles.groupItemName}>
                                {g.name} {isActive && <span style={styles.activePill}>Active</span>}
                              </div>
                              <div style={styles.groupItemCode}>Join Code: <b>{g.join_code}</b></div>
                            </div>
                            <div style={styles.groupItemActions}>
                              <button
                                style={styles.smallBtn}
                                onClick={() => copyJoinCode(g.join_code)}
                              >
                                Copy Code
                              </button>
                              {!isActive && (
                                <button
                                  style={styles.primarySmallBtn}
                                  onClick={() => setActiveGroup(g)}
                                >
                                  Switch to Group
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* SETTLEMENTS TAB */}
              {activeTab === 'settlements' && (
                <div style={styles.sectionContainer}>
                  <div style={styles.card}>
                    <h3 style={styles.sectionHeading}>Group Net Balances</h3>
                    <p style={styles.mutedText}>Positive balances mean members are owed money; negative balances mean members owe money.</p>
                    <div style={styles.balanceGrid}>
                      {Object.entries(balances).map(([person, bal]) => (
                        <div key={person} style={styles.balanceCardItem}>
                          <div style={styles.balPerson}>{person}</div>
                          <div style={{ ...styles.balAmount, color: bal > 0.01 ? '#16a34a' : bal < -0.01 ? '#dc2626' : 'var(--ink)' }}>
                            {bal > 0.01 ? `+${inr(bal)} (Gets back)` : bal < -0.01 ? `${inr(bal)} (Owes)` : 'Settled Up'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={styles.card}>
                    <h3 style={styles.sectionHeading}>Settle Up Plan (Optimized Transfers)</h3>
                    {settleTransactions.length === 0 ? (
                      <div style={styles.empty}>All balances are settled up! 🎉</div>
                    ) : (
                      <div style={styles.settleListContainer}>
                        {settleTransactions.map((tx, idx) => (
                          <div key={idx} style={styles.settleRow}>
                            <div>
                              <b>{tx.from}</b> pays <b>{tx.to}</b>
                            </div>
                            <div style={styles.settleAmountBadge}>{inr(tx.amount)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  centerScreen: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' },
  loadingCard: { background: '#fff', padding: 24, borderRadius: 16, boxShadow: '0 10px 25px rgba(0,0,0,0.05)', fontWeight: 600 },
  authScreen: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 16 },
  authCard: { width: '100%', maxWidth: 420, background: 'var(--card)', borderRadius: 24, padding: 32, boxShadow: '0 20px 40px rgba(124, 58, 237, 0.08)', border: '1px solid var(--line)' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  logo: { width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), var(--cyan))', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: 20 },
  authHeading: { fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: 0, color: 'var(--ink)' },
  authSub: { color: 'var(--muted)', fontSize: 14, marginBottom: 24 },
  authForm: { display: 'flex', flexDirection: 'column', gap: 16 },
  formGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 700, color: 'var(--ink)' },
  input: { width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontSize: 14, outline: 'none', background: '#f8f7fc', color: 'var(--ink)' },
  select: { width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontSize: 14, outline: 'none', background: '#f8f7fc', color: 'var(--ink)' },
  primaryBtn: { width: '100%', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)' },
  secondaryBtn: { background: 'var(--primary-light)', color: 'var(--primary)', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  secondaryBtnWide: { width: '100%', background: 'var(--primary-light)', color: 'var(--primary)', border: 'none', borderRadius: 12, padding: '12px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginTop: 4 },
  errorBox: { background: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600, marginTop: 12 },
  successBox: { background: '#f0fdf4', border: '1px solid #dcfce7', color: '#16a34a', padding: '12px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600, marginBottom: 16 },

  // SaaS Dashboard Layout
  dashboardLayout: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  sidebar: { width: 260, background: 'var(--card)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', flex: 'none', position: 'sticky', top: 0, height: '100vh' },
  sidebarBrand: { padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)' },
  sidebarTitle: { fontSize: 18, fontWeight: 900, color: 'var(--ink)' },
  navMenu: { padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' },
  navItemActive: { background: 'var(--primary-light)', color: 'var(--primary)' },
  sidebarFooter: { padding: 16, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 },
  userInfo: { fontSize: 13, color: 'var(--muted)', overflow: 'hidden' },
  userEmailText: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 },
  logoutBtn: { width: '100%', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },

  mainContent: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  header: { height: 72, background: 'var(--card)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', flex: 'none' },
  pageTitle: { fontSize: 20, fontWeight: 900, color: 'var(--ink)', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  groupSelectorWrapper: { display: 'flex', alignItems: 'center', gap: 8 },
  selectorLabel: { fontSize: 13, fontWeight: 700, color: 'var(--muted)' },
  groupSelect: { border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 600, background: '#f8f7fc', color: 'var(--ink)', outline: 'none' },
  headerActionBtn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },

  contentScroll: { flex: 1, padding: 32, overflowY: 'auto' },

  // Empty State
  emptyGroupCard: { background: 'var(--card)', borderRadius: 24, padding: 48, textAlign: 'center', maxWidth: 540, margin: '60px auto', border: '1px solid var(--line)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyHeading: { fontSize: 22, fontWeight: 900, color: 'var(--ink)', marginBottom: 8 },
  emptyText: { color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 },
  emptyActionRow: { display: 'flex', justifyContent: 'center' },

  // Dashboard Grid & Cards
  dashboardGrid: { display: 'flex', flexDirection: 'column', gap: 24 },
  groupCardBanner: { background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', borderRadius: 20, padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 12px 30px rgba(124, 58, 237, 0.2)' },
  badge: { background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' },
  groupBannerTitle: { fontSize: 24, fontWeight: 900, margin: '8px 0 4px 0' },
  groupBannerSub: { fontSize: 13, opacity: 0.9, margin: 0 },

  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
  metricCard: { background: 'var(--card)', borderRadius: 16, padding: 20, border: '1px solid var(--line)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' },
  metricIcon: { fontSize: 22, marginBottom: 8, display: 'block' },
  metricLabel: { fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 },
  metricValue: { fontSize: 24, fontWeight: 900, color: 'var(--ink)' },

  dashboardTwoColumn: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 },
  card: { background: 'var(--card)', borderRadius: 20, padding: 24, border: '1px solid var(--line)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', marginBottom: 24 },
  sectionHeading: { fontSize: 16, fontWeight: 900, color: 'var(--ink)', marginBottom: 16, marginTop: 0 },
  mutedText: { color: 'var(--muted)', fontSize: 14 },

  quickActionsList: { display: 'flex', flexDirection: 'column', gap: 10 },
  actionRowBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8f7fc', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', transition: 'background 0.2s' },

  miniExpenseList: { display: 'flex', flexDirection: 'column', gap: 12 },
  miniExpenseItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--line)' },
  miniExpName: { fontSize: 14, fontWeight: 700, color: 'var(--ink)' },
  miniExpMeta: { fontSize: 12, color: 'var(--muted)' },
  miniExpAmount: { fontSize: 15, fontWeight: 900, color: 'var(--ink)' },

  // Expenses & Forms
  sectionContainer: { display: 'flex', flexDirection: 'column', gap: 24 },
  formGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 },
  formGridTwo: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  checkboxGroup: { display: 'flex', flexWrap: 'wrap', gap: 12, background: '#f8f7fc', padding: 12, borderRadius: 12, border: '1px solid var(--line)' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' },

  expenseTable: { display: 'flex', flexDirection: 'column', gap: 12 },
  expenseRowItem: { display: 'flex', alignItems: 'center', gap: 16, background: '#f8f7fc', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px' },
  expEmojiBox: { width: 40, height: 40, borderRadius: 10, background: '#fff', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 20, flex: 'none' },
  expDetails: { flex: 1, minWidth: 0 },
  expName: { fontSize: 15, fontWeight: 800, color: 'var(--ink)' },
  expSub: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  expAmount: { fontSize: 16, fontWeight: 900, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' },
  deleteBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', padding: 4 },

  // Groups Tab
  groupsGridTwo: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 },
  groupListContainer: { display: 'flex', flexDirection: 'column', gap: 12 },
  groupListItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8f7fc', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 20px' },
  groupListItemActive: { borderColor: 'var(--primary)', background: 'var(--primary-light)' },
  groupItemName: { fontSize: 16, fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 },
  groupItemCode: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  groupItemActions: { display: 'flex', gap: 8 },
  activePill: { background: 'var(--primary)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' },
  smallBtn: { background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' },
  primarySmallBtn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },

  // Settlements Tab
  balanceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 12 },
  balanceCardItem: { background: '#f8f7fc', border: '1px solid var(--line)', borderRadius: 16, padding: 18, textAlign: 'center' },
  balPerson: { fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 },
  balAmount: { fontSize: 15, fontWeight: 900 },
  settleListContainer: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  settleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8f7fc', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px', fontSize: 14 },
  settleAmountBadge: { background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: 8, fontWeight: 900, fontSize: 15 },
};
