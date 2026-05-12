// ═══════════════════════════════════════════
// FIRST LIGHT — FINANCIAL FORTRESS
// Complete money manager: expenses, income, investments
// Phases 1+2+3 — localStorage + Supabase sync
// ═══════════════════════════════════════════

// ── CONSTANTS ──
var FINANCE_CATS = [
  { id: 'food',          label: 'FOOD',           icon: '🍽', color: '#FF6B35', budget: 8000 },
  { id: 'transport',     label: 'TRANSPORT',      icon: '🚗', color: '#00D4FF', budget: 4000 },
  { id: 'fitness',       label: 'FITNESS',        icon: '💪', color: '#00E676', budget: 3000 },
  { id: 'health',        label: 'HEALTH',         icon: '💊', color: '#FF5252', budget: 2000 },
  { id: 'personal',      label: 'PERSONAL CARE',  icon: '✨', color: '#F5A623', budget: 3000 },
  { id: 'entertainment', label: 'ENTERTAINMENT',  icon: '🎬', color: '#CE93D8', budget: 2000 },
  { id: 'learning',      label: 'LEARNING',       icon: '📚', color: '#4FC3F7', budget: 3000 },
  { id: 'household',     label: 'HOUSEHOLD',      icon: '🏠', color: '#A1887F', budget: 15000 },
  { id: 'tech',          label: 'TECH',           icon: '💻', color: '#90A4AE', budget: 3000 },
  { id: 'others',        label: 'OTHERS',         icon: '📦', color: '#9E9E9E', budget: 2000 }
];

var INVEST_TYPES = ['SIP', 'STOCKS', 'MF', 'FD', 'PPF', 'NPS', 'CRYPTO', 'OTHER'];
var INCOME_SOURCES = ['SALARY', 'FREELANCE', 'DIVIDEND', 'RENTAL', 'BUSINESS', 'OTHER'];
var PAY_MODES = ['UPI', 'CASH', 'CARD', 'NETBANKING', 'EMI'];

// ── DATA LAYER ──
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
    { id: 'overview',  label: 'OVERVIEW',  icon: '◈' },
    { id: 'add',       label: 'ADD',        icon: '+' },
    { id: 'timeline',  label: 'TIMELINE',   icon: '≡' },
    { id: 'invest',    label: 'INVEST',     icon: '▲' },
    { id: 'settings',  label: 'BUDGETS',    icon: '⚙' }
  ];

  var tabHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:20px">';
  tabs.forEach(function(t) {
    var active = _finTab === t.id;
    tabHtml += '<button onclick="renderFinancePanel(\'' + t.id + '\')" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;padding:6px 12px;border-radius:6px;border:1px solid ' + (active ? 'var(--cyan)' : 'rgba(0,212,255,0.15)') + ';background:' + (active ? 'rgba(0,212,255,0.1)' : 'transparent') + ';color:' + (active ? 'var(--cyan)' : 'var(--text-muted)') + ';cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent">' + t.icon + ' ' + t.label + '</button>';
  });
  tabHtml += '</div><div id="fin-tab-body"></div>';
  container.innerHTML = tabHtml;

  var body = document.getElementById('fin-tab-body');
  if (!body) return;
  if (_finTab === 'overview')  body.innerHTML = _buildFinOverview();
  else if (_finTab === 'add')  body.innerHTML = _buildFinAdd();
  else if (_finTab === 'timeline') body.innerHTML = _buildFinTimeline();
  else if (_finTab === 'invest')   body.innerHTML = _buildFinInvest();
  else if (_finTab === 'settings') body.innerHTML = _buildFinSettings();
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

  // Today's spend banner
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var todaySpend = stats.expenses.filter(function(e){return e.date===todayStr;}).reduce(function(s,e){return s+(parseFloat(e.amount)||0);},0);

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--cyan)">' + monthName + ' ' + year + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">Today: <span style="color:var(--gold);font-weight:700">' + finFmt(todaySpend) + '</span></div>';
  html += '</div>';

  // Summary cards 2x2
  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px">';
  function sumCard(label, val, color, sub) {
    return '<div style="padding:14px;background:var(--bg3);border:1px solid rgba(0,212,255,0.06);border-radius:10px">' +
      '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-bottom:4px">' + label + '</div>' +
      '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:' + color + '">' + val + '</div>' +
      (sub ? '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px">' + sub + '</div>' : '') +
      '</div>';
  }
  html += sumCard('THIS MONTH SPENT', finFmt(stats.totalExpense), budgetPct > 100 ? 'var(--red)' : budgetPct > 80 ? 'var(--gold)' : 'var(--green)', budgetPct + '% of ₹' + Math.round(totalBudget/1000) + 'K budget');
  html += sumCard('INCOME', finFmt(stats.totalIncome), 'var(--cyan)', stats.totalIncome > 0 ? 'logged this month' : 'add via ADD tab');
  html += sumCard('INVESTED', finFmt(stats.totalInvest), 'var(--gold)', 'this month');
  var srColor = stats.savingsRate >= 30 ? 'var(--green)' : stats.savingsRate >= 0 ? 'var(--gold)' : 'var(--red)';
  html += sumCard('SAVINGS RATE', stats.savingsRate + '%', srColor, finFmt(stats.savings) + ' saved');
  html += '</div>';

  // Yearly summary
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

  // Budget tracker
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">BUDGET TRACKER</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">';
  FINANCE_CATS.forEach(function(cat) {
    var spent = stats.byCat[cat.id] || 0;
    var budget = budgets[cat.id] || cat.budget;
    if (spent === 0 && budget === 0) return;
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

  // 6-month trend chart
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">6-MONTH TREND</div>';
  var months6 = [], maxSpend = 1;
  for (var mi = 5; mi >= 0; mi--) {
    var mDate = new Date(today.getFullYear(), today.getMonth() - mi, 1);
    var mStats = computeFinMonth(mDate.getFullYear(), mDate.getMonth());
    months6.push({ label: mDate.toLocaleString('default', { month: 'short' }).toUpperCase(), spend: mStats.totalExpense, year: mDate.getFullYear(), month: mDate.getMonth() });
    if (mStats.totalExpense > maxSpend) maxSpend = mStats.totalExpense;
  }
  html += '<div style="display:flex;gap:6px;align-items:flex-end;height:80px;margin-bottom:20px">';
  months6.forEach(function(m) {
    var barH = Math.max(Math.round((m.spend / maxSpend) * 58), m.spend > 0 ? 4 : 0);
    var isCurr = m.year === year && m.month === month;
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">';
    html += '<div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">' + (m.spend > 0 ? finFmt(m.spend) : '') + '</div>';
    html += '<div style="width:100%;background:' + (isCurr ? 'var(--cyan)' : 'rgba(0,212,255,0.25)') + ';height:' + barH + 'px;border-radius:3px 3px 0 0;min-height:' + (m.spend > 0 ? '3' : '0') + 'px"></div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:' + (isCurr ? 'var(--cyan)' : 'var(--text-dim)') + '">' + m.label + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Recent 7 expenses — scan last 2 months to find truly latest
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
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">';
  FINANCE_CATS.forEach(function(cat) {
    html += '<div id="fin-cat-' + cat.id + '" onclick="finSelectCat(\'' + cat.id + '\')" style="text-align:center;padding:8px 4px;border:1px solid rgba(0,212,255,0.1);border-radius:8px;cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation">';
    html += '<div style="font-size:18px;margin-bottom:2px">' + cat.icon + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">' + cat.label.slice(0,7) + '</div></div>';
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

// ── TIMELINE TAB ──
function _buildFinTimeline() {
  var year = _finViewYear, month = _finViewMonth;
  var stats = computeFinMonth(year, month);
  var monthDate = new Date(year, month, 1);
  var monthName = monthDate.toLocaleString('default', { month: 'long' }).toUpperCase();
  var today = new Date();
  var isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  var html = '';

  // Month navigator
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
  html += '<button onclick="finNavMonth(-1)" style="padding:6px 16px;border:1px solid rgba(0,212,255,0.15);background:transparent;color:var(--text-muted);font-family:var(--font-mono);font-size:14px;border-radius:6px;cursor:pointer">‹</button>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + (isCurrentMonth ? 'var(--cyan)' : 'var(--text)') + '">' + monthName + ' ' + year + '</div>';
  html += '<button onclick="finNavMonth(1)" style="padding:6px 16px;border:1px solid rgba(0,212,255,0.15);background:transparent;color:var(--text-muted);font-family:var(--font-mono);font-size:14px;border-radius:6px;cursor:pointer">›</button>';
  html += '</div>';

  // Summary row
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
    html += '<div style="text-align:center;padding:40px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No expenses logged this month.<br>Use ADD tab to log expenses.</div>';
  } else {
    // Group by day, descending
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
        html += '<span onclick="finDeleteExpense(\'' + e.id + '\',\'' + e.date + '\')" style="color:var(--text-dim);cursor:pointer;font-size:16px;padding:0 6px;opacity:0.5;-webkit-tap-highlight-color:transparent" title="Delete">×</span>';
        html += '</div>';
      });
      html += '</div>';
    });
  }

  // Income this month
  if (stats.income.length > 0) {
    var incTotal = stats.income.reduce(function(s,i){return s+(parseFloat(i.amount)||0);},0);
    html += '<div style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--green)">INCOME</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--green)">' + finFmt(incTotal) + ' total</div>';
    html += '</div>';
    stats.income.forEach(function(i) {
      html += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(0,229,160,0.05)">';
      html += '<span style="font-size:15px">💵</span>';
      html += '<div style="flex:1"><div style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + (i.description || i.source) + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + i.date + ' · ' + i.source + '</div></div>';
      html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--green)">+₹' + parseFloat(i.amount).toFixed(0) + '</div>';
      html += '<span onclick="deleteFinIncome(\'' + i.id + '\',\'' + i.date + '\')" style="color:var(--text-dim);cursor:pointer;font-size:16px;padding:0 6px;opacity:0.5;-webkit-tap-highlight-color:transparent" title="Delete">×</span>';
      html += '</div>';
    });
  }

  return html;
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
  html += '<input type="text" id="fin-inv-notes" class="form-input" style="font-size:12px;padding:8px 12px" placeholder="Folio number, reason, broker..."></div>';
  html += '<button onclick="finSubmitInvestment()" style="width:100%;padding:12px;background:rgba(245,166,35,0.1);color:var(--gold);font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;border:1px solid rgba(245,166,35,0.3);border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent" id="fin-inv-btn">+ ADD INVESTMENT</button>';
  html += '</div>';

  // Portfolio summary
  if (investments.length > 0) {
    html += '<div class="panel-section" style="border-color:rgba(245,166,35,0.12)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted)">PORTFOLIO SUMMARY</div>';
    html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--gold)">' + finFmt(total) + '</div>';
    html += '</div>';
    // By type breakdown
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
    // Recent history
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

// ── SETTINGS TAB ──
function _buildFinSettings() {
  var budgets = getFinBudgets();
  var total = FINANCE_CATS.reduce(function(s, c) { return s + (budgets[c.id] || 0); }, 0);
  var html = '';

  html += '<div class="panel-section" style="border-color:rgba(0,212,255,0.12)">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:16px;font-weight:700">MONTHLY BUDGET TARGETS</div>';
  FINANCE_CATS.forEach(function(cat) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
    html += '<span style="min-width:22px;text-align:center;font-size:16px">' + cat.icon + '</span>';
    html += '<div style="flex:1;font-family:var(--font-mono);font-size:11px;color:var(--text)">' + cat.label + '</div>';
    html += '<input type="number" id="finb-' + cat.id + '" value="' + (budgets[cat.id] || 0) + '" style="width:90px;padding:6px 8px;background:var(--bg3);border:1px solid rgba(0,212,255,0.15);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:12px;text-align:right">';
    html += '</div>';
  });
  html += '<button onclick="finSaveBudgets()" id="fin-budget-btn" style="width:100%;margin-top:8px;padding:12px;background:var(--cyan);color:#0A0C10;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;border:none;border-radius:8px;cursor:pointer">SAVE BUDGETS</button>';
  html += '</div>';
  html += '<div style="text-align:center;padding:10px 0 4px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">Total monthly budget: <span style="color:var(--cyan);font-weight:700">' + finFmt(total) + '</span></div>';

  // Data export section
  html += '<div class="panel-section" style="border-color:rgba(0,212,255,0.08);margin-top:0">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px">DATA EXPORT (10-YEAR ARCHIVE)</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button onclick="finExportCSV()" style="width:100%;padding:10px;background:transparent;color:var(--cyan);font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1.5px;border:1px solid rgba(0,212,255,0.2);border-radius:8px;cursor:pointer">↓ EXPORT ALL EXPENSES (CSV)</button>';
  html += '<button onclick="finExportInvestCSV()" style="width:100%;padding:10px;background:transparent;color:var(--gold);font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1.5px;border:1px solid rgba(245,166,35,0.2);border-radius:8px;cursor:pointer">↓ EXPORT INVESTMENTS (CSV)</button>';
  html += '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:10px;line-height:1.7">Exports all data from local storage as CSV. Run monthly for a complete 10-year archive. Supabase stores all data indefinitely as primary backup.</div>';
  html += '</div>';

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
  // Reset cat highlights
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
  renderFinancePanel('timeline');
}

function finDeleteInvestment(id) {
  if (!confirm('Delete this investment?')) return;
  deleteFinInvestment(id);
  renderFinancePanel('invest');
}

function finNavMonth(dir) {
  _finViewMonth += dir;
  if (_finViewMonth < 0) { _finViewMonth = 11; _finViewYear--; }
  if (_finViewMonth > 11) { _finViewMonth = 0; _finViewYear++; }
  renderFinancePanel('timeline');
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
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var todaySpend = stats.expenses.filter(function(e) { return e.date === todayStr; }).reduce(function(s, e) { return s + (parseFloat(e.amount) || 0); }, 0);

  el.innerHTML =
    '<div class="panel-section" style="border-color:rgba(245,166,35,0.15);background:rgba(245,166,35,0.01)">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:10px" onclick="switchPanel(\'finance\')">' +
    '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">💰</span>' +
    '<div><div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);letter-spacing:1px">FINANCIAL FORTRESS</div>' +
    '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Today: ' + finFmt(todaySpend) + ' · Month: ' + pct + '% of budget</div></div>' +
    '</div><div style="text-align:right">' +
    '<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:' + barColor + '">' + finFmt(stats.totalExpense) + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted)">THIS MONTH</div>' +
    '</div></div>' +
    '<div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">' +
    '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;transition:width 0.3s"></div>' +
    '</div></div>';
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
  // Quick add row
  html += '<div style="display:flex;gap:8px;margin-bottom:8px">';
  html += '<input type="number" id="fci-amount" placeholder="₹" style="width:80px;padding:8px 10px;background:var(--bg3);border:1px solid rgba(245,166,35,0.2);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:14px;font-weight:700;-webkit-tap-highlight-color:transparent">';
  html += '<input type="text" id="fci-desc" placeholder="What for?" style="flex:1;padding:8px 10px;background:var(--bg3);border:1px solid rgba(0,212,255,0.1);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:12px;-webkit-tap-highlight-color:transparent">';
  html += '</div>';
  // Category icons grid (2 rows of 5)
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:4px">';
  FINANCE_CATS.slice(0,5).forEach(function(cat) {
    html += '<div id="fci-cat-' + cat.id + '" onclick="fciSelectCat(\'' + cat.id + '\')" style="text-align:center;padding:7px 2px;border:1px solid rgba(0,212,255,0.08);border-radius:6px;cursor:pointer;font-size:17px;-webkit-tap-highlight-color:transparent;touch-action:manipulation" title="' + cat.label + '">' + cat.icon + '</div>';
  });
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:10px">';
  FINANCE_CATS.slice(5).forEach(function(cat) {
    html += '<div id="fci-cat-' + cat.id + '" onclick="fciSelectCat(\'' + cat.id + '\')" style="text-align:center;padding:7px 2px;border:1px solid rgba(0,212,255,0.08);border-radius:6px;cursor:pointer;font-size:17px;-webkit-tap-highlight-color:transparent;touch-action:manipulation" title="' + cat.label + '">' + cat.icon + '</div>';
  });
  html += '</div>';
  html += '<button onclick="fciAddExpense()" style="width:100%;padding:10px;background:rgba(245,166,35,0.1);color:var(--gold);font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1.5px;border:1px solid rgba(245,166,35,0.25);border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">+ ADD EXPENSE</button>';
  // Today's entries
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
  addFinExpense({
    date: today,
    amount: amount,
    category: _fciCat,
    description: ((document.getElementById('fci-desc') || {}).value || '').trim(),
    payment_mode: 'UPI'
  });
  if (amountEl) amountEl.value = '';
  var descEl = document.getElementById('fci-desc');
  if (descEl) descEl.value = '';
  _fciCat = null;
  if (typeof markSaved === 'function') markSaved();
  renderFinanceCheckinWidget();
  renderFinanceDashboardWidget();
}

// ── YEARLY HELPERS ──
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

function deleteFinIncome(id, date) {
  var parts = date.split('-');
  var year = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
  var key = 'fl_income_' + _finMonthKey(year, month);
  var incomes = [];
  try { incomes = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  localStorage.setItem(key, JSON.stringify(incomes.filter(function(i) { return i.id !== id; })));
  if (typeof sbFetch === 'function') sbFetch('income_log', 'DELETE', null, '?id=eq.' + id);
  renderFinancePanel('timeline');
}

function finExportCSV() {
  var today = new Date();
  var rows = ['Date,Category,Description,Amount,Payment Mode'];
  // Export all expense months in localStorage
  for (var y = today.getFullYear() - 10; y <= today.getFullYear(); y++) {
    for (var m = 0; m < 12; m++) {
      var mk = _finMonthKey(y, m);
      var expenses = [];
      try { expenses = JSON.parse(localStorage.getItem('fl_expenses_' + mk) || '[]'); } catch(e) {}
      expenses.forEach(function(e) {
        var desc = (e.description || '').replace(/,/g, ';').replace(/"/g, "'");
        rows.push([e.date, e.category, '"' + desc + '"', parseFloat(e.amount).toFixed(2), e.payment_mode || 'UPI'].join(','));
      });
    }
  }
  var csv = rows.join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
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
  a.href = url; a.download = 'firstlight_investments_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

// ── BOOTSTRAP FROM SUPABASE ──
(function _finLoadFromSupabase() {
  var SUPA = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || '';
  var KEY = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || '';
  if (!SUPA || !KEY) return;
  // Use session JWT for authenticated RLS tables (anon key alone is blocked)
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
      console.log('[Finance] Expenses synced from Supabase');
      renderFinanceDashboardWidget();
    })
    .catch(function() {});

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
    })
    .catch(function() {});

  // Budgets
  fetch(SUPA + '/rest/v1/finance_budgets', { headers: headers })
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(data) {
      if (!data || !data.length) return;
      var remote = {};
      data.forEach(function(b) { remote[b.category] = parseFloat(b.monthly_budget); });
      var local = {};
      try { local = JSON.parse(localStorage.getItem('fl_finance_budgets') || '{}'); } catch(e) {}
      var merged = Object.assign({}, remote, local);
      localStorage.setItem('fl_finance_budgets', JSON.stringify(merged));
    })
    .catch(function() {});

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
    })
    .catch(function() {});
})();

// Render dashboard widget on load
setTimeout(renderFinanceDashboardWidget, 200);
