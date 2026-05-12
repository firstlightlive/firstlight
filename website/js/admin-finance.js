// ═══════════════════════════════════════════
// FIRST LIGHT — FINANCIAL FORTRESS v2
// Money manager: expenses, income, investments, recurring, analytics
// 5 tabs: OVERVIEW | ADD | ANALYTICS | MANAGE | INVEST
// localStorage + Supabase sync
// ═══════════════════════════════════════════

// ── CATEGORIES (12 max, freq: daily|monthly|annual|occasional) ──
var FINANCE_CATS = [
  { id: 'food',          label: 'FOOD',          icon: '🍽', color: '#FF6B35', budget: 8000,  freq: 'daily',      annualBudget: 96000  },
  { id: 'transport',     label: 'TRANSPORT',     icon: '🚗', color: '#00D4FF', budget: 4000,  freq: 'daily',      annualBudget: 48000  },
  { id: 'fitness',       label: 'FITNESS',       icon: '💪', color: '#00E676', budget: 3000,  freq: 'monthly',    annualBudget: 40000  },
  { id: 'health',        label: 'HEALTH',        icon: '💊', color: '#FF5252', budget: 2000,  freq: 'occasional', annualBudget: 25000  },
  { id: 'personal',      label: 'PERSONAL CARE', icon: '✨', color: '#F5A623', budget: 3000,  freq: 'monthly',    annualBudget: 36000  },
  { id: 'entertainment', label: 'ENTERTAIN',     icon: '🎬', color: '#CE93D8', budget: 2000,  freq: 'monthly',    annualBudget: 24000  },
  { id: 'learning',      label: 'LEARNING',      icon: '📚', color: '#4FC3F7', budget: 3000,  freq: 'occasional', annualBudget: 30000  },
  { id: 'household',     label: 'HOUSEHOLD',     icon: '🏠', color: '#A1887F', budget: 15000, freq: 'monthly',    annualBudget: 180000 },
  { id: 'tech',          label: 'TECH & TOOLS',  icon: '💻', color: '#90A4AE', budget: 3000,  freq: 'occasional', annualBudget: 30000  },
  { id: 'vacation',      label: 'VACATION',      icon: '✈️', color: '#80CBC4', budget: 0,     freq: 'annual',     annualBudget: 60000  },
  { id: 'donations',     label: 'DONATIONS',     icon: '🎁', color: '#F48FB1', budget: 1000,  freq: 'occasional', annualBudget: 12000  },
  { id: 'others',        label: 'OTHERS',        icon: '📦', color: '#9E9E9E', budget: 2000,  freq: 'occasional', annualBudget: 20000  }
];

var INVEST_TYPES = ['SIP', 'STOCKS', 'MF', 'FD', 'PPF', 'NPS', 'CRYPTO', 'OTHER'];
var INCOME_SOURCES = ['SALARY', 'FREELANCE', 'DIVIDEND', 'RENTAL', 'BUSINESS', 'OTHER'];
var PAY_MODES = ['UPI', 'CASH', 'CARD', 'NETBANKING', 'EMI'];
var RECURRING_FREQS = ['MONTHLY', 'QUARTERLY', 'ANNUAL'];

// ── DATA LAYER — EXPENSES ──
function _finMonthKey(year, month) {
  return year + '-' + String(month + 1).padStart(2, '0');
}

function getFinExpenses(year, month) {
  var key = 'fl_expenses_' + _finMonthKey(year, month);
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}

function saveFinExpenses(year, month, expenses) {
  localStorage.setItem('fl_expenses_' + _finMonthKey(year, month), JSON.stringify(expenses));
}

function addFinExpense(expense) {
  var date = expense.date || (typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10));
  expense.date = date;
  var parts = date.split('-');
  var year = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
  var expenses = getFinExpenses(year, month);
  expense.id = expense.id || ('exp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
  expense.created_at = expense.created_at || new Date().toISOString();
  expenses.push(expense);
  saveFinExpenses(year, month, expenses);
  if (typeof syncSave === 'function') {
    syncSave('expense_log', {
      id: expense.id, date: expense.date, amount: expense.amount,
      category: expense.category, description: expense.description || '',
      payment_mode: expense.payment_mode || 'UPI'
    }, 'id');
  }
}

function deleteFinExpense(id, date) {
  var parts = date.split('-');
  var year = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
  var expenses = getFinExpenses(year, month).filter(function(e) { return e.id !== id; });
  saveFinExpenses(year, month, expenses);
  if (typeof sbFetch === 'function') sbFetch('expense_log', 'DELETE', null, '?id=eq.' + id);
}

// ── DATA LAYER — BUDGETS ──
function getFinBudgets() {
  var defaults = {};
  FINANCE_CATS.forEach(function(c) { defaults[c.id] = c.budget; });
  try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem('fl_finance_budgets') || '{}')); }
  catch(e) { return defaults; }
}

function saveFinBudgets(budgets) {
  localStorage.setItem('fl_finance_budgets', JSON.stringify(budgets));
  if (typeof syncSave === 'function') {
    Object.keys(budgets).forEach(function(cat) {
      syncSave('finance_budgets', { category: cat, monthly_budget: budgets[cat], updated_at: new Date().toISOString() }, 'category');
    });
  }
}

// ── DATA LAYER — ANNUAL BUDGETS ──
function getFinAnnualBudgets(year) {
  var defaults = {};
  FINANCE_CATS.forEach(function(c) { defaults[c.id] = c.annualBudget; });
  try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem('fl_finance_annual_budgets_' + year) || '{}')); }
  catch(e) { return defaults; }
}

function saveFinAnnualBudgets(year, budgets) {
  localStorage.setItem('fl_finance_annual_budgets_' + year, JSON.stringify(budgets));
  var SUPA = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || '';
  var KEY  = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || '';
  if (!SUPA || !KEY) return;
  var jwt = KEY;
  try {
    var ref = SUPA.split('//')[1].split('.')[0];
    var sess = JSON.parse(localStorage.getItem('sb-' + ref + '-auth-token') || 'null');
    if (sess && sess.access_token) jwt = sess.access_token;
  } catch(e) {}
  var rows = Object.keys(budgets).map(function(cat) {
    return { year: year, category: cat, annual_budget: budgets[cat], updated_at: new Date().toISOString() };
  });
  fetch(SUPA + '/rest/v1/finance_annual_budgets', {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(rows)
  }).catch(function() {});
}

// ── DATA LAYER — RECURRING BILLS ──
function getFinRecurring() {
  try { return JSON.parse(localStorage.getItem('fl_recurring') || '[]'); } catch(e) { return []; }
}

function saveFinRecurring(list) {
  localStorage.setItem('fl_recurring', JSON.stringify(list));
}

function addFinRecurring(item) {
  var list = getFinRecurring();
  item.id = item.id || ('rec_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
  item.active = item.active !== undefined ? item.active : true;
  item.created_at = item.created_at || new Date().toISOString();
  list.push(item);
  saveFinRecurring(list);
  if (typeof syncSave === 'function') {
    syncSave('finance_recurring', {
      id: item.id, name: item.name, category: item.category,
      amount: item.amount, frequency: item.frequency,
      due_day: item.due_day || null, due_month: item.due_month || null,
      active: item.active, notes: item.notes || ''
    }, 'id');
  }
}

function deleteFinRecurring(id) {
  saveFinRecurring(getFinRecurring().filter(function(r) { return r.id !== id; }));
  if (typeof sbFetch === 'function') sbFetch('finance_recurring', 'DELETE', null, '?id=eq.' + id);
}

function toggleFinRecurring(id) {
  var list = getFinRecurring();
  var item = list.find(function(r) { return r.id === id; });
  if (item) {
    item.active = !item.active;
    saveFinRecurring(list);
    if (typeof syncSave === 'function') {
      syncSave('finance_recurring', { id: item.id, active: item.active }, 'id');
    }
  }
  renderFinancePanel('manage');
}

// ── DATA LAYER — INVESTMENTS ──
function getFinInvestments() {
  try { return JSON.parse(localStorage.getItem('fl_investments') || '[]'); } catch(e) { return []; }
}

function addFinInvestment(inv) {
  var investments = getFinInvestments();
  inv.id = inv.id || ('inv_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
  inv.created_at = inv.created_at || new Date().toISOString();
  investments.push(inv);
  localStorage.setItem('fl_investments', JSON.stringify(investments));
  if (typeof syncSave === 'function') {
    syncSave('investment_log', {
      id: inv.id, date: inv.date, amount: inv.amount, type: inv.type,
      name: inv.name, units: inv.units || null, nav: inv.nav || null, notes: inv.notes || ''
    }, 'id');
  }
}

function deleteFinInvestment(id) {
  localStorage.setItem('fl_investments', JSON.stringify(getFinInvestments().filter(function(i) { return i.id !== id; })));
  if (typeof sbFetch === 'function') sbFetch('investment_log', 'DELETE', null, '?id=eq.' + id);
}

// ── DATA LAYER — INCOME ──
function getFinIncome(year, month) {
  try { return JSON.parse(localStorage.getItem('fl_income_' + _finMonthKey(year, month)) || '[]'); } catch(e) { return []; }
}

function addFinIncome(income) {
  var parts = income.date.split('-');
  var year = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
  var incomes = getFinIncome(year, month);
  income.id = income.id || ('inc_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
  income.created_at = income.created_at || new Date().toISOString();
  incomes.push(income);
  localStorage.setItem('fl_income_' + _finMonthKey(year, month), JSON.stringify(incomes));
  if (typeof syncSave === 'function') {
    syncSave('income_log', {
      id: income.id, date: income.date, amount: income.amount,
      source: income.source, description: income.description || ''
    }, 'id');
  }
}

function deleteFinIncome(id, date) {
  var parts = date.split('-');
  var year = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
  var key = 'fl_income_' + _finMonthKey(year, month);
  var incomes = [];
  try { incomes = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  localStorage.setItem(key, JSON.stringify(incomes.filter(function(i) { return i.id !== id; })));
  if (typeof sbFetch === 'function') sbFetch('income_log', 'DELETE', null, '?id=eq.' + id);
  renderFinancePanel('manage');
}

// ── COMPUTATIONS ──
function computeFinMonth(year, month) {
  var expenses = getFinExpenses(year, month);
  var income = getFinIncome(year, month);
  var mk = _finMonthKey(year, month);
  var investments = getFinInvestments().filter(function(inv) { return inv.date && inv.date.slice(0,7) === mk; });

  var totalExpense = expenses.reduce(function(s, e) { return s + (parseFloat(e.amount) || 0); }, 0);
  var totalIncome = income.reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
  var totalInvest = investments.reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0);

  var byCat = {};
  FINANCE_CATS.forEach(function(c) { byCat[c.id] = 0; });
  expenses.forEach(function(e) {
    var catId = byCat[e.category] !== undefined ? e.category : 'others';
    byCat[catId] += parseFloat(e.amount) || 0;
  });

  var savings = totalIncome - totalExpense - totalInvest;
  var savingsRate = totalIncome > 0 ? Math.round(savings / totalIncome * 100) : 0;
  return { totalExpense: totalExpense, totalIncome: totalIncome, totalInvest: totalInvest, savings: savings, savingsRate: savingsRate, byCat: byCat, expenses: expenses, income: income, investments: investments };
}

function computeFinYear(year) {
  var totalExpense = 0, totalIncome = 0, totalInvest = 0;
  var byCat = {};
  FINANCE_CATS.forEach(function(c) { byCat[c.id] = 0; });
  for (var m = 0; m < 12; m++) {
    var ms = computeFinMonth(year, m);
    totalExpense += ms.totalExpense;
    totalIncome += ms.totalIncome;
    totalInvest += ms.totalInvest;
    FINANCE_CATS.forEach(function(c) { byCat[c.id] += ms.byCat[c.id] || 0; });
  }
  var savings = totalIncome - totalExpense - totalInvest;
  var savingsRate = totalIncome > 0 ? Math.round(savings / totalIncome * 100) : 0;
  return { totalExpense: totalExpense, totalIncome: totalIncome, totalInvest: totalInvest, savings: savings, savingsRate: savingsRate, byCat: byCat };
}

function finFmt(num) {
  if (num === null || num === undefined || isNaN(num)) return '₹—';
  var n = Math.round(num);
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
}

// ── PANEL STATE ──
var _finTab = 'overview';
var _finViewYear = new Date().getFullYear();
var _finViewMonth = new Date().getMonth();

// ── PANEL RENDER ──
function renderFinancePanel(tab) {
  var container = document.getElementById('finance-container');
  if (!container) return;
  if (tab) _finTab = tab;

  var tabs = [
    { id: 'overview',  label: 'OVERVIEW',   icon: '◈' },
    { id: 'add',       label: 'ADD',         icon: '+' },
    { id: 'analytics', label: 'ANALYTICS',   icon: '▦' },
    { id: 'manage',    label: 'MANAGE',      icon: '≡' },
    { id: 'invest',    label: 'INVEST',      icon: '▲' }
  ];

  var tabHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:20px">';
  tabs.forEach(function(t) {
    var active = _finTab === t.id;
    tabHtml += '<button onclick="renderFinancePanel(\'' + t.id + '\')" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;padding:6px 12px;border-radius:6px;border:1px solid ' + (active ? 'var(--cyan)' : 'rgba(0,212,255,0.15)') + ';background:' + (active ? 'rgba(0,212,255,0.1)' : 'transparent') + ';color:' + (active ? 'var(--cyan)' : 'var(--text-muted)') + ';cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation">' + t.icon + ' ' + t.label + '</button>';
  });
  tabHtml += '</div><div id="fin-tab-body"></div>';
  container.innerHTML = tabHtml;

  var body = document.getElementById('fin-tab-body');
  if (!body) return;
  if (_finTab === 'overview')   body.innerHTML = _buildFinOverview();
  else if (_finTab === 'add')   body.innerHTML = _buildFinAdd();
  else if (_finTab === 'analytics') body.innerHTML = _buildFinAnalytics();
  else if (_finTab === 'manage')    body.innerHTML = _buildFinManage();
  else if (_finTab === 'invest')    body.innerHTML = _buildFinInvest();
  // also render timeline inside manage
  if (_finTab === 'manage') _attachManageListeners();
}

// ── OVERVIEW TAB ──
function _buildFinOverview() {
  var today = new Date();
  var year = today.getFullYear(), month = today.getMonth();
  var stats = computeFinMonth(year, month);
  var budgets = getFinBudgets();
  var totalBudget = FINANCE_CATS.reduce(function(s, c) { return s + (budgets[c.id] || 0); }, 0);
  var budgetPct = totalBudget > 0 ? Math.round(stats.totalExpense / totalBudget * 100) : 0;
  var monthName = today.toLocaleString('default', { month: 'long' }).toUpperCase();
  var html = '';

  // Today spend
  var todayStr = today.toISOString().slice(0,10);
  var todaySpend = stats.expenses.filter(function(e){ return e.date === todayStr; }).reduce(function(s,e){ return s + (parseFloat(e.amount)||0); },0);

  // MTD vs last month same day
  var prevMonthDate = new Date(year, month - 1, 1);
  var prevStats = computeFinMonth(prevMonthDate.getFullYear(), prevMonthDate.getMonth());
  var todayDay = today.getDate();
  var prevMTD = prevStats.expenses.filter(function(e) {
    return new Date(e.date).getDate() <= todayDay;
  }).reduce(function(s,e){ return s + (parseFloat(e.amount)||0); },0);
  var mtdDiff = stats.totalExpense - prevMTD;
  var mtdDiffPct = prevMTD > 0 ? Math.round(Math.abs(mtdDiff) / prevMTD * 100) : 0;
  var mtdColor = mtdDiff > 0 ? 'var(--red)' : 'var(--green)';
  var mtdSign = mtdDiff > 0 ? '+' : '-';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--cyan)">' + monthName + ' ' + year + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">Today: <span style="color:var(--gold);font-weight:700">' + finFmt(todaySpend) + '</span></div>';
  html += '</div>';

  // Summary cards 2x2
  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">';
  function sumCard(label, val, color, sub) {
    return '<div style="padding:14px;background:var(--bg3);border:1px solid rgba(0,212,255,0.06);border-radius:10px">' +
      '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:4px">' + label + '</div>' +
      '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:' + color + '">' + val + '</div>' +
      (sub ? '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px">' + sub + '</div>' : '') +
      '</div>';
  }
  html += sumCard('THIS MONTH SPENT', finFmt(stats.totalExpense), budgetPct > 100 ? 'var(--red)' : budgetPct > 80 ? 'var(--gold)' : 'var(--green)', budgetPct + '% of ' + finFmt(totalBudget) + ' budget');
  html += sumCard('INCOME', finFmt(stats.totalIncome), 'var(--cyan)', stats.totalIncome > 0 ? 'logged this month' : 'add via ADD tab');
  html += sumCard('INVESTED', finFmt(stats.totalInvest), 'var(--gold)', 'this month');
  var srColor = stats.savingsRate >= 30 ? 'var(--green)' : stats.savingsRate >= 0 ? 'var(--gold)' : 'var(--red)';
  html += sumCard('SAVINGS RATE', stats.savingsRate + '%', srColor, finFmt(stats.savings) + ' saved');
  html += '</div>';

  // MTD comparison banner
  if (prevMTD > 0) {
    html += '<div style="padding:10px 14px;background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.1);border-radius:8px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-muted)">MTD VS LAST MONTH (day ' + todayDay + ')</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + mtdColor + '">' + mtdSign + finFmt(Math.abs(mtdDiff)) + ' (' + mtdDiffPct + '%)</div>';
    html += '</div>';
  }

  // Category gap alerts
  var gapAlerts = [];
  FINANCE_CATS.forEach(function(cat) {
    if (cat.freq === 'annual' || cat.freq === 'occasional') {
      var spent = stats.byCat[cat.id] || 0;
      var annualSpent = computeFinYear(year).byCat[cat.id] || 0;
      var annualBudget = getFinAnnualBudgets(year)[cat.id] || cat.annualBudget;
      if (annualBudget > 0 && annualSpent === 0) {
        gapAlerts.push({ cat: cat, type: 'zero', msg: 'No spend yet this year' });
      } else if (annualBudget > 0 && annualSpent < annualBudget * 0.1 && month >= 3) {
        gapAlerts.push({ cat: cat, type: 'low', msg: 'Only ' + finFmt(annualSpent) + ' of ' + finFmt(annualBudget) + ' annual budget used' });
      }
    }
    // Monthly category not spent this month
    if (cat.freq === 'monthly' && (stats.byCat[cat.id] || 0) === 0 && month > 0) {
      gapAlerts.push({ cat: cat, type: 'missing', msg: 'Not spent this month yet' });
    }
  });
  if (gapAlerts.length > 0) {
    html += '<div style="margin-bottom:16px">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--gold);margin-bottom:8px">CATEGORY ALERTS</div>';
    gapAlerts.slice(0,4).forEach(function(a) {
      var alertColor = a.type === 'zero' ? 'var(--red)' : a.type === 'low' ? 'var(--gold)' : 'rgba(245,166,35,0.6)';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(245,166,35,0.04);border-left:2px solid ' + alertColor + ';border-radius:4px;margin-bottom:4px">';
      html += '<span>' + a.cat.icon + '</span>';
      html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text)">' + a.cat.label + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + a.msg + '</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Recurring bills due this month
  var recurring = getFinRecurring().filter(function(r) { return r.active; });
  var recurringMonthly = recurring.filter(function(r) { return r.frequency === 'MONTHLY'; });
  if (recurringMonthly.length > 0) {
    var recurringTotal = recurringMonthly.reduce(function(s,r){ return s+(parseFloat(r.amount)||0); },0);
    html += '<div style="margin-bottom:16px;padding:10px 14px;background:rgba(0,212,255,0.03);border:1px solid rgba(0,212,255,0.08);border-radius:8px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted)">RECURRING BILLS THIS MONTH</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--cyan)">' + finFmt(recurringTotal) + '</div>';
    html += '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
    recurringMonthly.slice(0,6).forEach(function(r) {
      var cat = FINANCE_CATS.find(function(c){ return c.id === r.category; }) || { icon: '📦' };
      html += '<div style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;background:var(--bg3);border-radius:12px;color:var(--text-muted)">' + cat.icon + ' ' + r.name + ' ' + finFmt(r.amount) + '</div>';
    });
    html += '</div></div>';
  }

  // Budget tracker
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">BUDGET TRACKER</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">';
  FINANCE_CATS.forEach(function(cat) {
    var spent = stats.byCat[cat.id] || 0;
    var budget = budgets[cat.id] || cat.budget;
    if (cat.freq === 'annual' && budget === 0) return; // skip zero-budget annual cats
    var pct = budget > 0 ? Math.min(Math.round(spent / budget * 100), 100) : (spent > 0 ? 100 : 0);
    var barColor = pct >= 100 ? '#FF5252' : pct >= 85 ? '#F5A623' : cat.color;
    html += '<div>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
    html += '<div style="display:flex;align-items:center;gap:6px"><span>' + cat.icon + '</span><span style="font-family:var(--font-mono);font-size:10px;color:var(--text)">' + cat.label + '</span></div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px"><span style="color:' + barColor + '">' + finFmt(spent) + '</span><span style="color:var(--text-dim)"> / ' + finFmt(budget) + '</span></div>';
    html += '</div>';
    html += '<div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;transition:width 0.3s"></div>';
    html += '</div></div>';
  });
  html += '</div>';

  // Annual summary
  var yearStats = computeFinYear(year);
  var ySrColor = yearStats.savingsRate >= 30 ? 'var(--green)' : yearStats.savingsRate >= 0 ? 'var(--gold)' : 'var(--red)';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">' + year + ' ANNUAL SUMMARY</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">';
  function yCard(label, val, color) {
    return '<div style="text-align:center;padding:10px 4px;background:var(--bg3);border:1px solid rgba(0,212,255,0.06);border-radius:8px">' +
      '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + color + '">' + val + '</div>' +
      '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1.5px;color:var(--text-dim);margin-top:3px">' + label + '</div></div>';
  }
  html += yCard('SPENT', finFmt(yearStats.totalExpense), 'var(--red)');
  html += yCard('INCOME', finFmt(yearStats.totalIncome), 'var(--cyan)');
  html += yCard('INVESTED', finFmt(yearStats.totalInvest), 'var(--gold)');
  html += yCard('SAVINGS %', yearStats.savingsRate + '%', ySrColor);
  html += '</div>';

  // Recent 7 expenses
  var recentAll = stats.expenses.slice();
  if (recentAll.length < 7) {
    var prevDate = new Date(year, month - 1, 1);
    var prev = getFinExpenses(prevDate.getFullYear(), prevDate.getMonth());
    recentAll = recentAll.concat(prev);
  }
  recentAll.sort(function(a,b){ return b.date > a.date ? 1 : (b.date < a.date ? -1 : 0); });
  var recent7 = recentAll.slice(0, 7);
  if (recent7.length > 0) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">RECENT TRANSACTIONS</div>';
    recent7.forEach(function(e) {
      var cat = FINANCE_CATS.find(function(c) { return c.id === e.category; }) || { icon: '📦', color: '#9E9E9E' };
      html += '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(0,212,255,0.04)">';
      html += '<span>' + cat.icon + '</span>';
      html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + (e.description || e.category.toUpperCase()) + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + e.date + ' · ' + (e.payment_mode || 'UPI') + '</div></div>';
      html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:' + cat.color + '">₹' + parseFloat(e.amount).toFixed(0) + '</div>';
      html += '</div>';
    });
  }

  return html;
}

// ── ADD TAB ──
function _buildFinAdd() {
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  var html = '';

  // ADD EXPENSE
  html += '<div class="panel-section" style="border-color:rgba(0,212,255,0.15)">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:16px;font-weight:700">ADD EXPENSE</div>';
  html += '<div style="margin-bottom:12px"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">AMOUNT (₹)</div>';
  html += '<input type="number" id="fin-exp-amount" class="form-input" style="font-size:22px;font-weight:700;padding:10px 14px" placeholder="0" min="0" step="1"></div>';
  html += '<div style="margin-bottom:12px"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:8px">CATEGORY</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">';
  FINANCE_CATS.forEach(function(cat) {
    html += '<div id="fin-cat-' + cat.id + '" onclick="finSelectCat(\'' + cat.id + '\')" style="text-align:center;padding:8px 4px;border:1px solid rgba(0,212,255,0.1);border-radius:8px;cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation">';
    html += '<div style="font-size:18px;margin-bottom:2px">' + cat.icon + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">' + cat.label.slice(0,8) + '</div></div>';
  });
  html += '</div></div>';
  html += '<div style="margin-bottom:10px"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">DESCRIPTION</div>';
  html += '<input type="text" id="fin-exp-desc" class="form-input" style="font-size:12px;padding:8px 12px" placeholder="What was this for?"></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">DATE</div>';
  html += '<input type="date" id="fin-exp-date" class="form-input" style="font-size:12px;padding:8px 12px" value="' + today + '"></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">PAYMENT</div>';
  html += '<select id="fin-exp-mode" class="form-input" style="font-size:12px;padding:8px 12px">';
  PAY_MODES.forEach(function(m) { html += '<option>' + m + '</option>'; });
  html += '</select></div></div>';
  html += '<button onclick="finSubmitExpense()" style="width:100%;padding:14px;background:var(--cyan);color:#0A0C10;font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:2px;border:none;border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation" id="fin-exp-btn">+ ADD EXPENSE</button>';
  html += '</div>';

  // LOG INCOME
  html += '<div class="panel-section" style="border-color:rgba(0,229,160,0.15)">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--green);margin-bottom:16px;font-weight:700">LOG INCOME</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">AMOUNT (₹)</div>';
  html += '<input type="number" id="fin-inc-amount" class="form-input" style="font-size:16px;padding:8px 12px" placeholder="0"></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">SOURCE</div>';
  html += '<select id="fin-inc-source" class="form-input" style="font-size:12px;padding:8px 12px">';
  INCOME_SOURCES.forEach(function(s) { html += '<option>' + s + '</option>'; });
  html += '</select></div></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">DATE</div>';
  html += '<input type="date" id="fin-inc-date" class="form-input" style="font-size:12px;padding:8px 12px" value="' + today + '"></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">NOTE</div>';
  html += '<input type="text" id="fin-inc-desc" class="form-input" style="font-size:12px;padding:8px 12px" placeholder="Salary, bonus..."></div></div>';
  html += '<button onclick="finSubmitIncome()" style="width:100%;padding:12px;background:rgba(0,229,160,0.08);color:var(--green);font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;border:1px solid rgba(0,229,160,0.25);border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent" id="fin-inc-btn">+ LOG INCOME</button>';
  html += '</div>';

  return html;
}

// ── ANALYTICS TAB ──
function _buildFinAnalytics() {
  var today = new Date();
  var curYear = today.getFullYear();
  var html = '';

  // ── 12-month bar chart (current year) ──
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px">' + curYear + ' — MONTHLY SPEND</div>';
  var monthlyData = [];
  var maxMonthSpend = 1;
  for (var mi = 0; mi < 12; mi++) {
    var ms = computeFinMonth(curYear, mi);
    monthlyData.push({ label: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][mi], spend: ms.totalExpense, month: mi });
    if (ms.totalExpense > maxMonthSpend) maxMonthSpend = ms.totalExpense;
  }
  var chartH = 90;
  html += '<div style="display:flex;gap:3px;align-items:flex-end;height:' + (chartH + 30) + 'px;margin-bottom:20px;overflow-x:auto;padding-bottom:4px">';
  monthlyData.forEach(function(m) {
    var barH = Math.max(Math.round((m.spend / maxMonthSpend) * chartH), m.spend > 0 ? 4 : 0);
    var isCurr = m.month === today.getMonth();
    html += '<div style="min-width:20px;flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    html += '<div style="font-family:var(--font-mono);font-size:6px;color:var(--text-dim);text-align:center">' + (m.spend > 0 ? finFmt(m.spend) : '') + '</div>';
    html += '<div style="width:100%;background:' + (isCurr ? 'var(--cyan)' : 'rgba(0,212,255,0.3)') + ';height:' + barH + 'px;border-radius:3px 3px 0 0;min-height:' + (m.spend > 0 ? '3' : '0') + 'px"></div>';
    html += '<div style="font-family:var(--font-mono);font-size:7px;color:' + (isCurr ? 'var(--cyan)' : 'var(--text-dim)') + '">' + m.label + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // ── MoM table (last 6 months) ──
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">MONTH-OVER-MONTH</div>';
  html += '<div style="overflow-x:auto;margin-bottom:20px"><table style="width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:10px">';
  html += '<thead><tr>';
  html += '<th style="text-align:left;padding:6px 4px;color:var(--text-dim);border-bottom:1px solid rgba(0,212,255,0.08)">MONTH</th>';
  html += '<th style="text-align:right;padding:6px 4px;color:var(--text-dim);border-bottom:1px solid rgba(0,212,255,0.08)">SPENT</th>';
  html += '<th style="text-align:right;padding:6px 4px;color:var(--text-dim);border-bottom:1px solid rgba(0,212,255,0.08)">INCOME</th>';
  html += '<th style="text-align:right;padding:6px 4px;color:var(--text-dim);border-bottom:1px solid rgba(0,212,255,0.08)">SAVED</th>';
  html += '<th style="text-align:right;padding:6px 4px;color:var(--text-dim);border-bottom:1px solid rgba(0,212,255,0.08)">DELTA</th>';
  html += '</tr></thead><tbody>';
  var prevRowSpend = 0;
  for (var mi2 = 5; mi2 >= 0; mi2--) {
    var mDate = new Date(curYear, today.getMonth() - mi2, 1);
    var mStats = computeFinMonth(mDate.getFullYear(), mDate.getMonth());
    var mLabel = mDate.toLocaleString('default', { month: 'short' }).toUpperCase() + ' ' + mDate.getFullYear();
    var delta = mi2 < 5 ? mStats.totalExpense - prevRowSpend : 0;
    var deltaColor = delta < 0 ? 'var(--green)' : delta > 0 ? 'var(--red)' : 'var(--text-dim)';
    var isCurr = mDate.getMonth() === today.getMonth() && mDate.getFullYear() === curYear;
    html += '<tr style="border-bottom:1px solid rgba(0,212,255,0.04);' + (isCurr ? 'background:rgba(0,212,255,0.04)' : '') + '">';
    html += '<td style="padding:7px 4px;color:' + (isCurr ? 'var(--cyan)' : 'var(--text)') + ';font-weight:' + (isCurr ? '700' : '400') + '">' + mLabel + '</td>';
    html += '<td style="text-align:right;padding:7px 4px;color:var(--red)">' + finFmt(mStats.totalExpense) + '</td>';
    html += '<td style="text-align:right;padding:7px 4px;color:var(--cyan)">' + finFmt(mStats.totalIncome) + '</td>';
    html += '<td style="text-align:right;padding:7px 4px;color:var(--green)">' + finFmt(mStats.savings) + '</td>';
    html += '<td style="text-align:right;padding:7px 4px;color:' + deltaColor + '">' + (mi2 < 5 && prevRowSpend > 0 ? (delta > 0 ? '+' : '') + finFmt(delta) : '—') + '</td>';
    html += '</tr>';
    prevRowSpend = mStats.totalExpense;
  }
  html += '</tbody></table></div>';

  // ── 5-year bar chart ──
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px">5-YEAR EXPENSE TREND</div>';
  var yearlyData = [];
  var maxYearSpend = 1;
  for (var yi = curYear - 4; yi <= curYear; yi++) {
    var ys = computeFinYear(yi);
    yearlyData.push({ year: yi, spend: ys.totalExpense, income: ys.totalIncome, invest: ys.totalInvest });
    if (ys.totalExpense > maxYearSpend) maxYearSpend = ys.totalExpense;
    if (ys.totalIncome > maxYearSpend) maxYearSpend = ys.totalIncome;
  }
  html += '<div style="display:flex;gap:8px;align-items:flex-end;height:110px;margin-bottom:20px">';
  yearlyData.forEach(function(y) {
    var barH = Math.max(Math.round((y.spend / maxYearSpend) * 80), y.spend > 0 ? 3 : 0);
    var incH = Math.max(Math.round((y.income / maxYearSpend) * 80), y.income > 0 ? 3 : 0);
    var isCurr = y.year === curYear;
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">';
    html += '<div style="width:100%;display:flex;gap:2px;align-items:flex-end;justify-content:center">';
    html += '<div style="flex:1;background:' + (isCurr ? 'var(--red)' : 'rgba(255,82,82,0.4)') + ';height:' + barH + 'px;border-radius:3px 3px 0 0;min-height:' + (y.spend > 0 ? '2' : '0') + 'px" title="Spent: ' + finFmt(y.spend) + '"></div>';
    html += '<div style="flex:1;background:' + (isCurr ? 'var(--cyan)' : 'rgba(0,212,255,0.3)') + ';height:' + incH + 'px;border-radius:3px 3px 0 0;min-height:' + (y.income > 0 ? '2' : '0') + 'px" title="Income: ' + finFmt(y.income) + '"></div>';
    html += '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:' + (isCurr ? 'var(--cyan)' : 'var(--text-dim)') + '">' + y.year + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">' + (y.spend > 0 ? finFmt(y.spend) : '') + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:12px;justify-content:center;margin-bottom:20px">';
  html += '<div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;background:var(--red);border-radius:2px"></div><span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">SPENT</span></div>';
  html += '<div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;background:var(--cyan);border-radius:2px"></div><span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">INCOME</span></div>';
  html += '</div>';

  // ── Category breakdown for current year ──
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">' + curYear + ' BY CATEGORY</div>';
  var yearByCat = computeFinYear(curYear).byCat;
  var totalYearSpend = Object.values(yearByCat).reduce(function(s,v){ return s+v; }, 0);
  var annualBudgets = getFinAnnualBudgets(curYear);
  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">';
  FINANCE_CATS.forEach(function(cat) {
    var spent = yearByCat[cat.id] || 0;
    var budget = annualBudgets[cat.id] || cat.annualBudget;
    if (spent === 0 && budget === 0) return;
    var pct = budget > 0 ? Math.min(Math.round(spent / budget * 100), 100) : (spent > 0 ? 100 : 0);
    var sharePct = totalYearSpend > 0 ? Math.round(spent / totalYearSpend * 100) : 0;
    var barColor = pct >= 100 ? '#FF5252' : pct >= 85 ? '#F5A623' : cat.color;
    html += '<div>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
    html += '<div style="display:flex;align-items:center;gap:6px"><span>' + cat.icon + '</span><span style="font-family:var(--font-mono);font-size:10px;color:var(--text)">' + cat.label + '</span><span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">(' + sharePct + '%)</span></div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px"><span style="color:' + barColor + '">' + finFmt(spent) + '</span><span style="color:var(--text-dim)"> / ' + finFmt(budget) + '</span></div>';
    html += '</div>';
    html += '<div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;transition:width 0.3s"></div>';
    html += '</div></div>';
  });
  html += '</div>';

  return html;
}

// ── MANAGE TAB ──
function _buildFinManage() {
  var today = new Date();
  var year = today.getFullYear(), month = today.getMonth();
  var html = '';

  // ── EXPENSE TIMELINE (month nav) ──
  var stats = computeFinMonth(_finViewYear, _finViewMonth);
  var monthDate = new Date(_finViewYear, _finViewMonth, 1);
  var monthName = monthDate.toLocaleString('default', { month: 'long' }).toUpperCase();
  var isCurrentMonth = _finViewYear === year && _finViewMonth === month;

  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">EXPENSE LOG</div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
  html += '<button id="fin-nav-prev" style="padding:6px 16px;border:1px solid rgba(0,212,255,0.15);background:transparent;color:var(--text-muted);font-family:var(--font-mono);font-size:14px;border-radius:6px;cursor:pointer">‹</button>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + (isCurrentMonth ? 'var(--cyan)' : 'var(--text)') + '">' + monthName + ' ' + _finViewYear + '</div>';
  html += '<button id="fin-nav-next" style="padding:6px 16px;border:1px solid rgba(0,212,255,0.15);background:transparent;color:var(--text-muted);font-family:var(--font-mono);font-size:14px;border-radius:6px;cursor:pointer">›</button>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">';
  function tlCard(val, label, color) {
    return '<div style="text-align:center;padding:10px;background:var(--bg3);border-radius:8px;border:1px solid rgba(0,212,255,0.06)">' +
      '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + color + '">' + val + '</div>' +
      '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-dim);margin-top:2px">' + label + '</div></div>';
  }
  html += tlCard(finFmt(stats.totalExpense), 'SPENT', 'var(--red)');
  html += tlCard(stats.expenses.length, 'ENTRIES', 'var(--cyan)');
  html += tlCard(stats.expenses.length > 0 ? finFmt(stats.totalExpense / stats.expenses.length) : '₹0', 'AVG/ENTRY', 'var(--gold)');
  html += '</div>';

  if (stats.expenses.length === 0) {
    html += '<div style="text-align:center;padding:24px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No expenses logged this month.</div>';
  } else {
    var byDay = {};
    stats.expenses.forEach(function(e) {
      if (!byDay[e.date]) byDay[e.date] = [];
      byDay[e.date].push(e);
    });
    Object.keys(byDay).sort().reverse().forEach(function(day) {
      var dayExps = byDay[day];
      var dayTotal = dayExps.reduce(function(s, e) { return s + parseFloat(e.amount); }, 0);
      html += '<div style="margin-bottom:14px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(0,212,255,0.1);margin-bottom:6px">';
      html += '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--text-muted)">' + day + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--red)">₹' + dayTotal.toFixed(0) + '</div></div>';
      dayExps.forEach(function(e) {
        var cat = FINANCE_CATS.find(function(c) { return c.id === e.category; }) || { icon: '📦', color: '#9E9E9E' };
        html += '<div style="display:flex;align-items:center;gap:10px;padding:5px 0">';
        html += '<span style="font-size:15px">' + cat.icon + '</span>';
        html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + (e.description || e.category.toUpperCase()) + '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + (e.payment_mode || 'UPI') + '</div></div>';
        html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:' + cat.color + '">₹' + parseFloat(e.amount).toFixed(0) + '</div>';
        html += '<span onclick="finDeleteExpense(\'' + e.id + '\',\'' + e.date + '\')" style="color:var(--text-dim);cursor:pointer;font-size:16px;padding:0 6px;opacity:0.5;-webkit-tap-highlight-color:transparent">×</span>';
        html += '</div>';
      });
      html += '</div>';
    });
  }

  // Income this month
  if (stats.income.length > 0) {
    var incTotal = stats.income.reduce(function(s,i){ return s+(parseFloat(i.amount)||0); },0);
    html += '<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--green)">INCOME</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--green)">' + finFmt(incTotal) + '</div>';
    html += '</div>';
    stats.income.forEach(function(i) {
      html += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(0,229,160,0.05)">';
      html += '<span style="font-size:15px">💵</span>';
      html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + (i.description || i.source) + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + i.date + ' · ' + i.source + '</div></div>';
      html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--green)">+₹' + parseFloat(i.amount).toFixed(0) + '</div>';
      html += '<span onclick="deleteFinIncome(\'' + i.id + '\',\'' + i.date + '\')" style="color:var(--text-dim);cursor:pointer;font-size:16px;padding:0 6px;opacity:0.5;-webkit-tap-highlight-color:transparent">×</span>';
      html += '</div>';
    });
  }

  // ── RECURRING BILLS ──
  html += '<div style="margin-top:24px;font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">RECURRING BILLS</div>';
  var recurring = getFinRecurring();
  var activeRec = recurring.filter(function(r){ return r.active; });
  var totalMonthly = recurring.filter(function(r){ return r.active && r.frequency === 'MONTHLY'; }).reduce(function(s,r){ return s+(parseFloat(r.amount)||0); },0);
  if (totalMonthly > 0) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-bottom:10px">Monthly commitment: <span style="color:var(--cyan);font-weight:700">' + finFmt(totalMonthly) + '</span></div>';
  }

  if (recurring.length === 0) {
    html += '<div style="padding:12px;font-family:var(--font-mono);font-size:10px;color:var(--text-dim);text-align:center">No recurring bills added yet.</div>';
  } else {
    recurring.forEach(function(r) {
      var cat = FINANCE_CATS.find(function(c){ return c.id === r.category; }) || { icon: '📦', color: '#9E9E9E' };
      var freq = r.frequency || 'MONTHLY';
      html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,212,255,0.04);opacity:' + (r.active ? '1' : '0.45') + '">';
      html += '<span style="font-size:16px">' + cat.icon + '</span>';
      html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + r.name + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + freq + (r.due_day ? ' · Due day ' + r.due_day : '') + (r.notes ? ' · ' + r.notes : '') + '</div></div>';
      html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + cat.color + '">' + finFmt(r.amount) + '</div>';
      html += '<button onclick="toggleFinRecurring(\'' + r.id + '\')" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid rgba(0,212,255,0.15);background:transparent;color:' + (r.active ? 'var(--green)' : 'var(--text-dim)') + ';cursor:pointer;font-family:var(--font-mono);-webkit-tap-highlight-color:transparent">' + (r.active ? 'ON' : 'OFF') + '</button>';
      html += '<span onclick="finDeleteRecurring(\'' + r.id + '\')" style="color:var(--text-dim);cursor:pointer;font-size:16px;padding:0 6px;opacity:0.5;-webkit-tap-highlight-color:transparent">×</span>';
      html += '</div>';
    });
  }

  // Add recurring form
  html += '<div style="margin-top:14px;padding:14px;background:rgba(0,212,255,0.02);border:1px solid rgba(0,212,255,0.1);border-radius:10px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px">ADD RECURRING BILL</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:4px">NAME</div><input type="text" id="fin-rec-name" class="form-input" style="font-size:11px;padding:7px 10px" placeholder="Netflix, Rent..."></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:4px">AMOUNT</div><input type="number" id="fin-rec-amount" class="form-input" style="font-size:11px;padding:7px 10px" placeholder="0"></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:4px">CATEGORY</div><select id="fin-rec-cat" class="form-input" style="font-size:10px;padding:7px 8px">';
  FINANCE_CATS.forEach(function(c){ html += '<option value="' + c.id + '">' + c.icon + ' ' + c.label + '</option>'; });
  html += '</select></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:4px">FREQUENCY</div><select id="fin-rec-freq" class="form-input" style="font-size:10px;padding:7px 8px">';
  RECURRING_FREQS.forEach(function(f){ html += '<option>' + f + '</option>'; });
  html += '</select></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:4px">DUE DAY</div><input type="number" id="fin-rec-day" class="form-input" style="font-size:11px;padding:7px 10px" placeholder="1-31" min="1" max="31"></div>';
  html += '</div>';
  html += '<button onclick="finAddRecurring()" style="width:100%;padding:10px;background:rgba(0,212,255,0.08);color:var(--cyan);font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:1.5px;border:1px solid rgba(0,212,255,0.2);border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent">+ ADD BILL</button>';
  html += '</div>';

  // ── MONTHLY BUDGETS ──
  html += '<div style="margin-top:24px;font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">MONTHLY BUDGET TARGETS</div>';
  var budgets = getFinBudgets();
  var totalMonthBudget = FINANCE_CATS.reduce(function(s, c) { return s + (budgets[c.id] || 0); }, 0);
  html += '<div class="panel-section" style="border-color:rgba(0,212,255,0.12);padding:12px">';
  FINANCE_CATS.forEach(function(cat) {
    if (cat.freq === 'annual') return;
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
    html += '<span style="min-width:22px;text-align:center;font-size:15px">' + cat.icon + '</span>';
    html += '<div style="flex:1;font-family:var(--font-mono);font-size:10px;color:var(--text)">' + cat.label + '</div>';
    html += '<input type="number" id="finb-' + cat.id + '" value="' + (budgets[cat.id] || 0) + '" style="width:80px;padding:5px 7px;background:var(--bg3);border:1px solid rgba(0,212,255,0.15);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:11px;text-align:right">';
    html += '</div>';
  });
  html += '<div style="text-align:right;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:10px">Total: <span style="color:var(--cyan)">' + finFmt(totalMonthBudget) + '/mo</span></div>';
  html += '<button onclick="finSaveBudgets()" id="fin-budget-btn" style="width:100%;padding:10px;background:var(--cyan);color:#0A0C10;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;border:none;border-radius:8px;cursor:pointer">SAVE BUDGETS</button>';
  html += '</div>';

  // ── ANNUAL BUDGETS ──
  html += '<div style="margin-top:20px;font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">' + year + ' ANNUAL BUDGETS</div>';
  var annualBudgets = getFinAnnualBudgets(year);
  html += '<div class="panel-section" style="border-color:rgba(245,166,35,0.12);padding:12px">';
  FINANCE_CATS.forEach(function(cat) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
    html += '<span style="min-width:22px;text-align:center;font-size:15px">' + cat.icon + '</span>';
    html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text)">' + cat.label + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + cat.freq + '</div></div>';
    html += '<input type="number" id="finab-' + cat.id + '" value="' + (annualBudgets[cat.id] || 0) + '" style="width:80px;padding:5px 7px;background:var(--bg3);border:1px solid rgba(245,166,35,0.15);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:11px;text-align:right">';
    html += '</div>';
  });
  html += '<button onclick="finSaveAnnualBudgets()" id="fin-abudget-btn" style="width:100%;margin-top:6px;padding:10px;background:rgba(245,166,35,0.1);color:var(--gold);font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;border:1px solid rgba(245,166,35,0.25);border-radius:8px;cursor:pointer">SAVE ANNUAL BUDGETS</button>';
  html += '</div>';

  // ── DATA EXPORT ──
  html += '<div style="margin-top:20px;font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">DATA EXPORT</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">';
  html += '<button onclick="finExportCSV()" style="width:100%;padding:10px;background:transparent;color:var(--cyan);font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:1.5px;border:1px solid rgba(0,212,255,0.2);border-radius:8px;cursor:pointer">↓ EXPORT ALL EXPENSES (CSV)</button>';
  html += '<button onclick="finExportInvestCSV()" style="width:100%;padding:10px;background:transparent;color:var(--gold);font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:1.5px;border:1px solid rgba(245,166,35,0.2);border-radius:8px;cursor:pointer">↓ EXPORT INVESTMENTS (CSV)</button>';
  html += '</div>';

  return html;
}

function _attachManageListeners() {
  var prev = document.getElementById('fin-nav-prev');
  var next = document.getElementById('fin-nav-next');
  if (prev) prev.addEventListener('click', function() { finNavMonth(-1); });
  if (next) next.addEventListener('click', function() { finNavMonth(1); });
}

// ── INVEST TAB ──
function _buildFinInvest() {
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  var investments = getFinInvestments().sort(function(a,b) { return b.date > a.date ? 1 : -1; });
  var total = investments.reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
  var html = '';

  // Add form
  html += '<div class="panel-section" style="border-color:rgba(245,166,35,0.2)">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--gold);margin-bottom:16px;font-weight:700">ADD INVESTMENT</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">AMOUNT (₹)</div>';
  html += '<input type="number" id="fin-inv-amount" class="form-input" style="font-size:16px;padding:8px 12px" placeholder="0"></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">TYPE</div>';
  html += '<select id="fin-inv-type" class="form-input" style="font-size:12px;padding:8px 12px">';
  INVEST_TYPES.forEach(function(t) { html += '<option>' + t + '</option>'; });
  html += '</select></div></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">FUND / STOCK NAME</div>';
  html += '<input type="text" id="fin-inv-name" class="form-input" style="font-size:12px;padding:8px 12px" placeholder="Parag Parikh Flexi Cap..."></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">DATE</div>';
  html += '<input type="date" id="fin-inv-date" class="form-input" style="font-size:12px;padding:8px 12px" value="' + today + '"></div></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">UNITS (optional)</div>';
  html += '<input type="number" id="fin-inv-units" class="form-input" style="font-size:12px;padding:8px 12px" placeholder="0.0000" step="0.0001"></div>';
  html += '<div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">NAV / PRICE (optional)</div>';
  html += '<input type="number" id="fin-inv-nav" class="form-input" style="font-size:12px;padding:8px 12px" placeholder="0.00" step="0.01"></div></div>';
  html += '<div style="margin-bottom:16px"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:6px">NOTES (optional)</div>';
  html += '<input type="text" id="fin-inv-notes" class="form-input" style="font-size:12px;padding:8px 12px" placeholder="Folio, reason, broker..."></div>';
  html += '<button onclick="finSubmitInvestment()" style="width:100%;padding:12px;background:rgba(245,166,35,0.1);color:var(--gold);font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;border:1px solid rgba(245,166,35,0.3);border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent" id="fin-inv-btn">+ ADD INVESTMENT</button>';
  html += '</div>';

  // Portfolio summary
  if (investments.length > 0) {
    html += '<div class="panel-section" style="border-color:rgba(245,166,35,0.12)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted)">ALL-TIME INVESTED</div>';
    html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--gold)">' + finFmt(total) + '</div>';
    html += '</div>';
    var byType = {};
    investments.forEach(function(i) { byType[i.type] = (byType[i.type] || 0) + (parseFloat(i.amount) || 0); });
    html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">';
    Object.keys(byType).sort().forEach(function(type) {
      var pct = Math.round(byType[type] / total * 100);
      html += '<div style="display:flex;align-items:center;gap:8px">';
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text);min-width:70px">' + type + '</div>';
      html += '<div style="flex:1;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden">';
      html += '<div style="height:100%;width:' + pct + '%;background:var(--gold);border-radius:3px"></div></div>';
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--gold);min-width:55px;text-align:right">' + finFmt(byType[type]) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:8px">HISTORY</div>';
    investments.slice(0, 50).forEach(function(inv) {
      html += '<div style="padding:8px 0;border-bottom:1px solid rgba(245,166,35,0.05)">';
      html += '<div style="display:flex;align-items:center;gap:8px">';
      html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + inv.name + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + inv.date + ' · ' + inv.type + (inv.units ? ' · ' + parseFloat(inv.units).toFixed(4) + 'u' : '') + (inv.nav ? ' @ ₹' + parseFloat(inv.nav).toFixed(2) : '') + '</div></div>';
      html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--gold)">₹' + parseFloat(inv.amount).toFixed(0) + '</div>';
      html += '<span onclick="finDeleteInvestment(\'' + inv.id + '\')" style="color:var(--text-dim);cursor:pointer;font-size:16px;padding:0 6px;opacity:0.5;-webkit-tap-highlight-color:transparent">×</span>';
      html += '</div>';
      if (inv.notes) html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px;padding-left:2px;font-style:italic">' + inv.notes + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  return html;
}

// ── ACTIONS ──
var _finSelectedCat = null;

function finSelectCat(catId) {
  _finSelectedCat = catId;
  FINANCE_CATS.forEach(function(cat) {
    var el = document.getElementById('fin-cat-' + cat.id);
    if (!el) return;
    var selected = cat.id === catId;
    var c = FINANCE_CATS.find(function(x) { return x.id === catId; });
    el.style.borderColor = selected ? (c ? c.color : 'var(--cyan)') : 'rgba(0,212,255,0.1)';
    el.style.background = selected ? 'rgba(0,212,255,0.07)' : 'transparent';
    el.style.transform = selected ? 'scale(1.06)' : 'scale(1)';
  });
}

function finSubmitExpense() {
  var amountEl = document.getElementById('fin-exp-amount');
  var amount = parseFloat(amountEl ? amountEl.value : 0);
  if (!amount || amount <= 0) { if (amountEl) amountEl.focus(); return; }
  if (!_finSelectedCat) { alert('Select a category'); return; }
  addFinExpense({
    date: document.getElementById('fin-exp-date').value,
    amount: amount,
    category: _finSelectedCat,
    description: (document.getElementById('fin-exp-desc').value || '').trim(),
    payment_mode: document.getElementById('fin-exp-mode').value
  });
  document.getElementById('fin-exp-amount').value = '';
  document.getElementById('fin-exp-desc').value = '';
  _finSelectedCat = null;
  if (typeof markSaved === 'function') markSaved();
  var btn = document.getElementById('fin-exp-btn');
  if (btn) { var orig = btn.textContent; btn.textContent = '✓ ADDED'; btn.style.background = 'var(--green)'; setTimeout(function() { btn.textContent = orig; btn.style.background = 'var(--cyan)'; }, 1600); }
  FINANCE_CATS.forEach(function(cat) {
    var el = document.getElementById('fin-cat-' + cat.id);
    if (el) { el.style.borderColor = 'rgba(0,212,255,0.1)'; el.style.background = 'transparent'; el.style.transform = 'scale(1)'; }
  });
  renderFinanceDashboardWidget();
}

function finSubmitIncome() {
  var amount = parseFloat((document.getElementById('fin-inc-amount') || {}).value);
  if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
  addFinIncome({
    date: document.getElementById('fin-inc-date').value,
    amount: amount,
    source: document.getElementById('fin-inc-source').value,
    description: (document.getElementById('fin-inc-desc').value || '').trim()
  });
  document.getElementById('fin-inc-amount').value = '';
  document.getElementById('fin-inc-desc').value = '';
  if (typeof markSaved === 'function') markSaved();
  var btn = document.getElementById('fin-inc-btn');
  if (btn) { var orig = btn.textContent; btn.textContent = '✓ LOGGED'; btn.style.color = 'var(--cyan)'; setTimeout(function() { btn.textContent = orig; btn.style.color = 'var(--green)'; }, 1600); }
}

function finSubmitInvestment() {
  var amount = parseFloat((document.getElementById('fin-inv-amount') || {}).value);
  var name = ((document.getElementById('fin-inv-name') || {}).value || '').trim();
  if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
  if (!name) { alert('Enter fund / stock name'); return; }
  addFinInvestment({
    date: document.getElementById('fin-inv-date').value,
    amount: amount,
    type: document.getElementById('fin-inv-type').value,
    name: name,
    units: parseFloat(document.getElementById('fin-inv-units').value) || null,
    nav: parseFloat(document.getElementById('fin-inv-nav').value) || null,
    notes: ((document.getElementById('fin-inv-notes') || {}).value || '').trim()
  });
  document.getElementById('fin-inv-amount').value = '';
  document.getElementById('fin-inv-name').value = '';
  document.getElementById('fin-inv-units').value = '';
  document.getElementById('fin-inv-nav').value = '';
  var notesEl = document.getElementById('fin-inv-notes');
  if (notesEl) notesEl.value = '';
  if (typeof markSaved === 'function') markSaved();
  renderFinancePanel('invest');
}

function finDeleteExpense(id, date) {
  if (!confirm('Delete this expense?')) return;
  deleteFinExpense(id, date);
  renderFinanceDashboardWidget();
  renderFinancePanel('manage');
}

function finDeleteInvestment(id) {
  if (!confirm('Delete this investment?')) return;
  deleteFinInvestment(id);
  renderFinancePanel('invest');
}

function finDeleteRecurring(id) {
  if (!confirm('Delete recurring bill?')) return;
  deleteFinRecurring(id);
  renderFinancePanel('manage');
}

function finAddRecurring() {
  var name = ((document.getElementById('fin-rec-name') || {}).value || '').trim();
  var amount = parseFloat((document.getElementById('fin-rec-amount') || {}).value);
  var cat = (document.getElementById('fin-rec-cat') || {}).value;
  var freq = (document.getElementById('fin-rec-freq') || {}).value || 'MONTHLY';
  var dueDay = parseInt((document.getElementById('fin-rec-day') || {}).value) || null;
  if (!name) { alert('Enter bill name'); return; }
  if (!amount || amount <= 0) { alert('Enter amount'); return; }
  addFinRecurring({ name: name, category: cat, amount: amount, frequency: freq, due_day: dueDay });
  if (typeof markSaved === 'function') markSaved();
  renderFinancePanel('manage');
}

function finNavMonth(dir) {
  _finViewMonth += dir;
  if (_finViewMonth < 0) { _finViewMonth = 11; _finViewYear--; }
  if (_finViewMonth > 11) { _finViewMonth = 0; _finViewYear++; }
  renderFinancePanel('manage');
}

function finSaveBudgets() {
  var budgets = {};
  FINANCE_CATS.forEach(function(cat) {
    var el = document.getElementById('finb-' + cat.id);
    budgets[cat.id] = el ? (parseFloat(el.value) || 0) : cat.budget;
  });
  saveFinBudgets(budgets);
  if (typeof markSaved === 'function') markSaved();
  renderFinanceDashboardWidget();
  var btn = document.getElementById('fin-budget-btn');
  if (btn) { var orig = btn.textContent; btn.textContent = '✓ SAVED'; setTimeout(function() { btn.textContent = orig; }, 1600); }
}

function finSaveAnnualBudgets() {
  var year = new Date().getFullYear();
  var budgets = {};
  FINANCE_CATS.forEach(function(cat) {
    var el = document.getElementById('finab-' + cat.id);
    budgets[cat.id] = el ? (parseFloat(el.value) || 0) : cat.annualBudget;
  });
  saveFinAnnualBudgets(year, budgets);
  if (typeof markSaved === 'function') markSaved();
  var btn = document.getElementById('fin-abudget-btn');
  if (btn) { var orig = btn.textContent; btn.textContent = '✓ SAVED'; setTimeout(function() { btn.textContent = orig; }, 1600); }
}

// ── DASHBOARD WIDGET ──
function renderFinanceDashboardWidget() {
  var el = document.getElementById('finance-dashboard-widget');
  if (!el) return;
  var today = new Date();
  var year = today.getFullYear(), month = today.getMonth();
  var stats = computeFinMonth(year, month);
  var budgets = getFinBudgets();
  var totalBudget = FINANCE_CATS.reduce(function(s, c) { return s + (budgets[c.id] || 0); }, 0);
  var pct = totalBudget > 0 ? Math.min(Math.round(stats.totalExpense / totalBudget * 100), 100) : 0;
  var barColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--gold)' : 'var(--green)';
  var todayStr = today.toISOString().slice(0,10);
  var todaySpend = stats.expenses.filter(function(e) { return e.date === todayStr; }).reduce(function(s, e) { return s + (parseFloat(e.amount) || 0); }, 0);

  // Quick-add expense form
  var qHtml = '<div style="margin-top:10px;display:flex;gap:6px;align-items:center">';
  qHtml += '<input type="number" id="fwq-amount" placeholder="₹" style="width:70px;padding:7px 8px;background:var(--bg3);border:1px solid rgba(245,166,35,0.2);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:13px;font-weight:700;-webkit-tap-highlight-color:transparent">';
  qHtml += '<input type="text" id="fwq-desc" placeholder="What for?" style="flex:1;padding:7px 8px;background:var(--bg3);border:1px solid rgba(0,212,255,0.1);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:11px;-webkit-tap-highlight-color:transparent">';
  qHtml += '</div>';
  qHtml += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin-top:6px">';
  FINANCE_CATS.slice(0,6).forEach(function(cat) {
    qHtml += '<div id="fwq-cat-' + cat.id + '" onclick="fwqSelectCat(\'' + cat.id + '\')" style="text-align:center;padding:5px 2px;border:1px solid rgba(0,212,255,0.08);border-radius:5px;cursor:pointer;font-size:16px;-webkit-tap-highlight-color:transparent;touch-action:manipulation" title="' + cat.label + '">' + cat.icon + '</div>';
  });
  qHtml += '</div>';
  qHtml += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin-top:3px">';
  FINANCE_CATS.slice(6).forEach(function(cat) {
    qHtml += '<div id="fwq-cat-' + cat.id + '" onclick="fwqSelectCat(\'' + cat.id + '\')" style="text-align:center;padding:5px 2px;border:1px solid rgba(0,212,255,0.08);border-radius:5px;cursor:pointer;font-size:16px;-webkit-tap-highlight-color:transparent;touch-action:manipulation" title="' + cat.label + '">' + cat.icon + '</div>';
  });
  qHtml += '</div>';
  qHtml += '<button onclick="fwqAddExpense()" style="width:100%;margin-top:6px;padding:8px;background:rgba(245,166,35,0.08);color:var(--gold);font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:1.5px;border:1px solid rgba(245,166,35,0.2);border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent">QUICK ADD</button>';

  el.innerHTML =
    '<div class="panel-section" style="border-color:rgba(245,166,35,0.15);background:rgba(245,166,35,0.01)">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:8px" onclick="switchPanel(\'finance\')">' +
    '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">💰</span>' +
    '<div><div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);letter-spacing:1px">FINANCIAL FORTRESS</div>' +
    '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Today: ' + finFmt(todaySpend) + ' · Month: ' + pct + '% of budget</div></div>' +
    '</div><div style="text-align:right">' +
    '<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:' + barColor + '">' + finFmt(stats.totalExpense) + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted)">THIS MONTH</div>' +
    '</div></div>' +
    '<div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">' +
    '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;transition:width 0.3s"></div>' +
    '</div>' + qHtml + '</div>';
}

var _fwqCat = null;
function fwqSelectCat(catId) {
  _fwqCat = catId;
  var selCat = FINANCE_CATS.find(function(c){ return c.id === catId; });
  FINANCE_CATS.forEach(function(cat) {
    var el = document.getElementById('fwq-cat-' + cat.id);
    if (!el) return;
    var isSelected = cat.id === catId;
    el.style.borderColor = isSelected ? (selCat ? selCat.color : 'var(--cyan)') : 'rgba(0,212,255,0.08)';
    el.style.background = isSelected ? 'rgba(245,166,35,0.08)' : 'transparent';
  });
}

function fwqAddExpense() {
  var amountEl = document.getElementById('fwq-amount');
  var amount = parseFloat(amountEl ? amountEl.value : 0);
  if (!amount || amount <= 0) { if (amountEl) amountEl.focus(); return; }
  if (!_fwqCat) { alert('Tap a category icon first'); return; }
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  addFinExpense({
    date: today, amount: amount, category: _fwqCat,
    description: ((document.getElementById('fwq-desc') || {}).value || '').trim(),
    payment_mode: 'UPI'
  });
  if (amountEl) amountEl.value = '';
  var descEl = document.getElementById('fwq-desc');
  if (descEl) descEl.value = '';
  _fwqCat = null;
  if (typeof markSaved === 'function') markSaved();
  renderFinanceDashboardWidget();
}

// ── CHECK-IN WIDGET ──
function renderFinanceCheckinWidget() {
  var el = document.getElementById('finance-checkin-widget');
  if (!el) return;
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  var parts = today.split('-');
  var year = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
  var expenses = getFinExpenses(year, month);
  var todayExp = expenses.filter(function(e) { return e.date === today; });
  var todayTotal = todayExp.reduce(function(s, e) { return s + (parseFloat(e.amount) || 0); }, 0);

  var html = '';
  html += '<div style="padding:16px;background:rgba(245,166,35,0.03);border:1px solid rgba(245,166,35,0.12);border-radius:12px;margin-bottom:16px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
  html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--gold)">TODAY\'S SPEND</div>';
  html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--gold)">₹' + todayTotal.toFixed(0) + '</div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-bottom:8px">';
  html += '<input type="number" id="fci-amount" placeholder="₹" style="width:80px;padding:8px 10px;background:var(--bg3);border:1px solid rgba(245,166,35,0.2);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:14px;font-weight:700;-webkit-tap-highlight-color:transparent">';
  html += '<input type="text" id="fci-desc" placeholder="What for?" style="flex:1;padding:8px 10px;background:var(--bg3);border:1px solid rgba(0,212,255,0.1);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:12px;-webkit-tap-highlight-color:transparent">';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:4px">';
  FINANCE_CATS.slice(0,6).forEach(function(cat) {
    html += '<div id="fci-cat-' + cat.id + '" onclick="fciSelectCat(\'' + cat.id + '\')" style="text-align:center;padding:7px 2px;border:1px solid rgba(0,212,255,0.08);border-radius:6px;cursor:pointer;font-size:17px;-webkit-tap-highlight-color:transparent;touch-action:manipulation" title="' + cat.label + '">' + cat.icon + '</div>';
  });
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:10px">';
  FINANCE_CATS.slice(6).forEach(function(cat) {
    html += '<div id="fci-cat-' + cat.id + '" onclick="fciSelectCat(\'' + cat.id + '\')" style="text-align:center;padding:7px 2px;border:1px solid rgba(0,212,255,0.08);border-radius:6px;cursor:pointer;font-size:17px;-webkit-tap-highlight-color:transparent;touch-action:manipulation" title="' + cat.label + '">' + cat.icon + '</div>';
  });
  html += '</div>';
  html += '<button onclick="fciAddExpense()" style="width:100%;padding:10px;background:rgba(245,166,35,0.1);color:var(--gold);font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1.5px;border:1px solid rgba(245,166,35,0.25);border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">+ ADD EXPENSE</button>';
  if (todayExp.length > 0) {
    html += '<div style="margin-top:10px;border-top:1px solid rgba(245,166,35,0.1);padding-top:8px">';
    todayExp.forEach(function(e) {
      var cat = FINANCE_CATS.find(function(c) { return c.id === e.category; }) || { icon: '📦', color: '#9E9E9E' };
      html += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">';
      html += '<span style="font-size:14px">' + cat.icon + '</span>';
      html += '<div style="flex:1;font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + (e.description || e.category.toUpperCase()) + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--gold)">₹' + parseFloat(e.amount).toFixed(0) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

var _fciCat = null;
function fciSelectCat(catId) {
  _fciCat = catId;
  var selCat = FINANCE_CATS.find(function(c) { return c.id === catId; });
  FINANCE_CATS.forEach(function(cat) {
    var el = document.getElementById('fci-cat-' + cat.id);
    if (!el) return;
    var isSelected = cat.id === catId;
    el.style.borderColor = isSelected ? (selCat ? selCat.color : 'var(--cyan)') : 'rgba(0,212,255,0.08)';
    el.style.background = isSelected ? 'rgba(245,166,35,0.08)' : 'transparent';
  });
}

function fciAddExpense() {
  var amountEl = document.getElementById('fci-amount');
  var amount = parseFloat(amountEl ? amountEl.value : 0);
  if (!amount || amount <= 0) { if (amountEl) amountEl.focus(); return; }
  if (!_fciCat) { alert('Tap a category icon first'); return; }
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  addFinExpense({ date: today, amount: amount, category: _fciCat, description: ((document.getElementById('fci-desc') || {}).value || '').trim(), payment_mode: 'UPI' });
  if (amountEl) amountEl.value = '';
  var descEl = document.getElementById('fci-desc');
  if (descEl) descEl.value = '';
  _fciCat = null;
  if (typeof markSaved === 'function') markSaved();
  renderFinanceCheckinWidget();
  renderFinanceDashboardWidget();
}

// ── CSV EXPORT ──
function finExportCSV() {
  var today = new Date();
  var rows = ['Date,Category,Description,Amount,Payment Mode'];
  for (var y = today.getFullYear() - 10; y <= today.getFullYear(); y++) {
    for (var m = 0; m < 12; m++) {
      var expenses = [];
      try { expenses = JSON.parse(localStorage.getItem('fl_expenses_' + _finMonthKey(y, m)) || '[]'); } catch(e) {}
      expenses.forEach(function(e) {
        var desc = (e.description || '').replace(/,/g, ';').replace(/"/g, "'");
        rows.push([e.date, e.category, '"' + desc + '"', parseFloat(e.amount).toFixed(2), e.payment_mode || 'UPI'].join(','));
      });
    }
  }
  var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'firstlight_expenses_' + today.toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function finExportInvestCSV() {
  var rows = ['Date,Type,Name,Amount,Units,NAV,Notes'];
  getFinInvestments().forEach(function(i) {
    rows.push([i.date, i.type, '"' + (i.name||'').replace(/"/g,"'") + '"', parseFloat(i.amount).toFixed(2), i.units||'', i.nav||'', '"' + (i.notes||'').replace(/"/g,"'") + '"'].join(','));
  });
  var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'firstlight_investments_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── BOOTSTRAP FROM SUPABASE ──
(function _finLoadFromSupabase() {
  var SUPA = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || '';
  var KEY = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || '';
  if (!SUPA || !KEY) return;
  var jwt = KEY;
  try {
    var ref = SUPA.split('//')[1].split('.')[0];
    var sess = JSON.parse(localStorage.getItem('sb-' + ref + '-auth-token') || 'null');
    if (sess && sess.access_token) jwt = sess.access_token;
  } catch(e) {}
  var headers = { 'apikey': KEY, 'Authorization': 'Bearer ' + jwt };
  var sixAgo = new Date(Date.now() - 180 * 86400000);
  var since = sixAgo.getFullYear() + '-' + String(sixAgo.getMonth()+1).padStart(2,'0') + '-01';

  // Expenses
  fetch(SUPA + '/rest/v1/expense_log?date=gte.' + since + '&order=date.desc', { headers: headers })
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      var byMonth = {};
      data.forEach(function(e) {
        var mk = e.date.slice(0,7);
        if (!byMonth[mk]) byMonth[mk] = [];
        byMonth[mk].push({ id: e.id, date: e.date, amount: parseFloat(e.amount), category: e.category, description: e.description || '', payment_mode: e.payment_mode || 'UPI', created_at: e.created_at });
      });
      Object.keys(byMonth).forEach(function(mk) {
        var lkey = 'fl_expenses_' + mk;
        var local = [];
        try { local = JSON.parse(localStorage.getItem(lkey) || '[]'); } catch(e) {}
        var localIds = {};
        local.forEach(function(e) { localIds[e.id] = true; });
        var added = 0;
        byMonth[mk].forEach(function(e) { if (!localIds[e.id]) { local.push(e); added++; } });
        if (!localStorage.getItem(lkey) || added > 0) localStorage.setItem(lkey, JSON.stringify(local));
      });
      renderFinanceDashboardWidget();
    }).catch(function() {});

  // Investments
  fetch(SUPA + '/rest/v1/investment_log?order=date.desc', { headers: headers })
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      var local = getFinInvestments();
      var localIds = {};
      local.forEach(function(i) { localIds[i.id] = true; });
      var added = 0;
      data.forEach(function(i) {
        if (!localIds[i.id]) {
          local.push({ id: i.id, date: i.date, amount: parseFloat(i.amount), type: i.type, name: i.name, units: i.units, nav: i.nav, notes: i.notes || '', created_at: i.created_at });
          added++;
        }
      });
      if (added > 0) localStorage.setItem('fl_investments', JSON.stringify(local));
    }).catch(function() {});

  // Budgets
  fetch(SUPA + '/rest/v1/finance_budgets', { headers: headers })
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      var remote = {};
      data.forEach(function(b) { remote[b.category] = parseFloat(b.monthly_budget); });
      var local = {};
      try { local = JSON.parse(localStorage.getItem('fl_finance_budgets') || '{}'); } catch(e) {}
      localStorage.setItem('fl_finance_budgets', JSON.stringify(Object.assign({}, remote, local)));
    }).catch(function() {});

  // Income
  fetch(SUPA + '/rest/v1/income_log?date=gte.' + since + '&order=date.desc', { headers: headers })
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      var byMonth = {};
      data.forEach(function(i) {
        var mk = i.date.slice(0,7);
        if (!byMonth[mk]) byMonth[mk] = [];
        byMonth[mk].push({ id: i.id, date: i.date, amount: parseFloat(i.amount), source: i.source, description: i.description || '', created_at: i.created_at });
      });
      Object.keys(byMonth).forEach(function(mk) {
        var lkey = 'fl_income_' + mk;
        if (!localStorage.getItem(lkey)) localStorage.setItem(lkey, JSON.stringify(byMonth[mk]));
      });
    }).catch(function() {});

  // Recurring bills
  fetch(SUPA + '/rest/v1/finance_recurring?order=created_at.asc', { headers: headers })
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      var local = getFinRecurring();
      var localIds = {};
      local.forEach(function(r) { localIds[r.id] = true; });
      var added = 0;
      data.forEach(function(r) {
        if (!localIds[r.id]) {
          local.push({ id: r.id, name: r.name, category: r.category, amount: parseFloat(r.amount), frequency: r.frequency, due_day: r.due_day, due_month: r.due_month, active: r.active, notes: r.notes || '', created_at: r.created_at });
          added++;
        }
      });
      if (added > 0) saveFinRecurring(local);
    }).catch(function() {});
})();

// Render dashboard widget on load
setTimeout(renderFinanceDashboardWidget, 200);
