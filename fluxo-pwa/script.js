// ============================================================
// FLUXO PWA — script.js
// ============================================================
// Adaptações mobile adicionadas:
//   - Registro do Service Worker (PWA)
//   - Prompt de instalação (A2HS)
//   - Bottom nav (substituiu sidebar)
//   - Inner tabs (Novo | Histórico) em Receitas e Despesas
//   - Inputs com inputmode para teclado numérico correto
// ============================================================

'use strict';

// ============================================================
// 1. STORAGE MODULE
// ============================================================

const Storage = {
  save(key, data) {
    try {
      localStorage.setItem(`fluxo_${key}`, JSON.stringify(data));
    } catch (err) {
      console.error('[Storage] Falha ao salvar:', err);
    }
  },

  load(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`fluxo_${key}`);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.error('[Storage] Falha ao carregar:', err);
      return fallback;
    }
  },

  remove(key) {
    localStorage.removeItem(`fluxo_${key}`);
  }
};

// ============================================================
// 2. DATA MODULE
// ============================================================

const Data = {

  getIncomes() {
    return Storage.load('incomes', []);
  },

  addIncome(income) {
    const list = this.getIncomes();
    list.push({
      ...income,
      id:     Date.now().toString(),
      amount: parseFloat(income.amount)
    });
    Storage.save('incomes', list);
  },

  deleteIncome(id) {
    Storage.save('incomes', this.getIncomes().filter(i => i.id !== id));
  },

  getExpenses() {
    return Storage.load('expenses', []);
  },

  addExpense(expense) {
    const list = this.getExpenses();
    list.push({
      ...expense,
      id:         Date.now().toString(),
      amount:     parseFloat(expense.amount),
      expenseType: expense.expenseType || 'Variável'
    });
    Storage.save('expenses', list);
  },

  deleteExpense(id) {
    Storage.save('expenses', this.getExpenses().filter(e => e.id !== id));
  },

  getReserve() {
    return Storage.load('reserve', { goal: 0, current: 0 });
  },

  saveReserve(data) {
    Storage.save('reserve', data);
  },

  getNotes() {
    return Storage.load('notes', '');
  },

  saveNotes(text) {
    Storage.save('notes', text);
  },

  getGoals() {
    return Storage.load('goals', []);
  },

  addGoal(goal) {
    const list = this.getGoals();
    list.push({
      ...goal,
      id:           Date.now().toString(),
      target:       parseFloat(goal.target),
      current:      parseFloat(goal.current) || 0,
      contribType:  goal.contribType  || 'none',
      contribValue: parseFloat(goal.contribValue) || 0
    });
    Storage.save('goals', list);
  },

  updateGoalCurrent(id, newVal) {
    const list = this.getGoals().map(g =>
      g.id === id ? { ...g, current: Math.max(0, newVal) } : g
    );
    Storage.save('goals', list);
  },

  deleteGoal(id) {
    Storage.save('goals', this.getGoals().filter(g => g.id !== id));
  }
};

// ============================================================
// 3. CALC MODULE
// ============================================================

const Calc = {

  filterByMonth(items, month) {
    if (!month || month === 'all') return items;
    return items.filter(i => i.date && i.date.startsWith(month));
  },

  sum(items) {
    return items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  },

  getTotalBalance() {
    return this.sum(Data.getIncomes()) - this.sum(Data.getExpenses());
  },

  getMonthlySummary(month) {
    const incomes  = this.filterByMonth(Data.getIncomes(),  month);
    const expenses = this.filterByMonth(Data.getExpenses(), month);
    const income   = this.sum(incomes);
    const expense  = this.sum(expenses);
    return { income, expense, savings: income - expense };
  },

  groupByCategory(expenses) {
    return expenses.reduce((acc, e) => {
      const cat = e.category || 'Outro';
      acc[cat] = (acc[cat] || 0) + e.amount;
      return acc;
    }, {});
  },

  groupByPayment(expenses) {
    return expenses.reduce((acc, e) => {
      const pay = e.payment || 'Outro';
      acc[pay] = (acc[pay] || 0) + e.amount;
      return acc;
    }, {});
  },

  getAvailableMonths() {
    const dates = [
      ...Data.getIncomes().map(i => i.date),
      ...Data.getExpenses().map(e => e.date)
    ];
    const months = [...new Set(dates.map(d => d?.substring(0, 7)).filter(Boolean))];
    return months.sort((a, b) => b.localeCompare(a));
  },

  formatMonth(ym) {
    const [y, m] = ym.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year:  'numeric'
    });
  }
};

// ============================================================
// 4. NAV MODULE — Bottom Nav (mobile) + header settings btn
// ============================================================

const Nav = {

  current: 'dashboard',

  navigateTo(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));

    const targetEl = document.getElementById(`section-${section}`);
    if (targetEl) targetEl.classList.add('active');

    // Ativa o item da bottom nav (settings não tem item na nav)
    const navBtn = document.querySelector(`.bnav-item[data-section="${section}"]`);
    if (navBtn) navBtn.classList.add('active');

    this.current = section;

    // Scroll para o topo
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });

    UI.renderSection(section);
  }
};

// Atalho global
function navigateTo(section) {
  Nav.navigateTo(section);
}

// ============================================================
// INNER TABS — Novo | Histórico (Receitas e Despesas)
// ============================================================

/**
 * Alterna entre sub-abas de uma seção (form / list).
 * @param {'incomes'|'expenses'} section
 * @param {'form'|'list'} tab
 */
function switchInnerTab(section, tab) {
  // Atualiza botões
  const switcher = document.getElementById(`${section}TabSwitcher`);
  if (switcher) {
    switcher.querySelectorAll('.tab-sw-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
  }

  // Atualiza painéis
  ['form', 'list'].forEach(t => {
    const panel = document.getElementById(`${section}Tab-${t}`);
    if (panel) panel.classList.toggle('active', t === tab);
  });

  // Se abriu a lista, renderiza
  if (tab === 'list') {
    if (section === 'incomes')  UI.renderIncomeList();
    if (section === 'expenses') UI.renderExpenseList();
  }
}

// ============================================================
// 5. UI MODULE
// ============================================================

const UI = {

  fmt(val) {
    return (val || 0).toLocaleString('pt-BR', {
      style:    'currency',
      currency: 'BRL'
    });
  },

  fmtDate(d) {
    if (!d) return '—';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${y}`;
  },

  toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = `toast toast-${type} show`;
    setTimeout(() => el.classList.remove('show'), 3200);
  },

  populateMonthFilter(selectId, activeMonth) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const months = Calc.getAvailableMonths();
    if (!months.includes(activeMonth)) months.unshift(activeMonth);

    el.innerHTML =
      `<option value="all">Todos os meses</option>` +
      months.map(m =>
        `<option value="${m}" ${m === activeMonth ? 'selected' : ''}>${Calc.formatMonth(m)}</option>`
      ).join('');
  },

  renderSection(section) {
    const map = {
      dashboard: () => this.renderDashboard(),
      incomes:   () => this.renderIncomes(),
      expenses:  () => this.renderExpenses(),
      reports:   () => this.renderReports(),
      goals:     () => this.renderGoals()
    };
    if (map[section]) map[section]();
  },

  // ---- DASHBOARD ----

  renderDashboard() {
    const now     = new Date();
    const month   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const summary = Calc.getMonthlySummary(month);
    const balance = Calc.getTotalBalance();
    const reserve = Data.getReserve();

    const balEl = document.getElementById('dashBalance');
    balEl.textContent = this.fmt(balance);
    balEl.className   = `card-value balance-value ${balance >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('dashIncome').textContent   = this.fmt(summary.income);
    document.getElementById('dashExpenses').textContent = this.fmt(summary.expense);

    const savEl = document.getElementById('dashSavings');
    savEl.textContent = this.fmt(summary.savings);
    savEl.className   = `card-value ${summary.savings >= 0 ? 'positive' : 'negative'}`;

    const goal    = reserve.goal    || 0;
    const current = reserve.current || 0;
    const pct     = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;

    document.getElementById('reserveCurrent').textContent = this.fmt(current);
    document.getElementById('reserveGoal').textContent    = this.fmt(goal);
    document.getElementById('reservePercent').textContent = `${pct.toFixed(0)}%`;
    document.getElementById('reserveProgress').style.width = `${pct}%`;

    this.renderRecentTransactions();
  },

  renderRecentTransactions() {
    const all = [
      ...Data.getIncomes().map(i  => ({ ...i,  type: 'income'  })),
      ...Data.getExpenses().map(e => ({ ...e,  type: 'expense' }))
    ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

    const container = document.getElementById('recentTransactions');

    if (!all.length) {
      container.innerHTML = `
        <p class="empty-state">
          Nenhuma transação ainda.<br>
          Comece adicionando uma receita ou despesa.
        </p>`;
      return;
    }

    container.innerHTML = all.map((t, idx) => `
      <div class="transaction-item ${t.type} fade-in" style="animation-delay:${idx * 0.04}s">
        <div class="t-left">
          <span class="t-icon">${t.type === 'income' ? '↑' : '↓'}</span>
          <div>
            <div class="t-desc">${t.description || (t.type === 'income' ? t.source : t.category)}</div>
            <div class="t-meta">${this.fmtDate(t.date)} · ${t.type === 'income' ? t.source : `${t.category} · ${t.payment}`}</div>
          </div>
        </div>
        <div class="t-amount ${t.type}">
          ${t.type === 'income' ? '+' : '−'}${this.fmt(t.amount)}
        </div>
      </div>
    `).join('');
  },

  // ---- RECEITAS ----

  renderIncomes() {
    const month = this._currentMonth();
    this.populateMonthFilter('incomeMonthFilter', month);

    const sel = document.getElementById('incomeMonthFilter');
    if (sel) sel.onchange = () => this.renderIncomeList();

    this.renderIncomeList();
  },

  renderIncomeList() {
    const filter   = document.getElementById('incomeMonthFilter')?.value || 'all';
    const incomes  = Calc.filterByMonth(Data.getIncomes(), filter !== 'all' ? filter : null);
    const sorted   = [...incomes].sort((a, b) => new Date(b.date) - new Date(a.date));
    const total    = Calc.sum(sorted);
    const container = document.getElementById('incomeList');

    if (!sorted.length) {
      container.innerHTML = `<p class="empty-state">Nenhuma receita no período selecionado.</p>`;
      return;
    }

    container.innerHTML =
      `<div class="list-total">Total: <strong>${this.fmt(total)}</strong></div>` +
      sorted.map((i, idx) => `
        <div class="finance-item income fade-in" style="animation-delay:${idx * 0.035}s">
          <div class="fi-left">
            <span class="fi-badge income-badge">${i.source}</span>
            <span class="fi-desc">${i.description || '—'}</span>
          </div>
          <div class="fi-right">
            <span class="fi-amount income">+${this.fmt(i.amount)}</span>
            <span class="fi-date">${this.fmtDate(i.date)}</span>
            <button class="delete-btn" onclick="deleteIncome('${i.id}')" title="Excluir">×</button>
          </div>
        </div>
      `).join('');
  },

  // ---- DESPESAS ----

  renderExpenses() {
    const month = this._currentMonth();
    this.populateMonthFilter('expenseMonthFilter', month);

    const sel = document.getElementById('expenseMonthFilter');
    if (sel) sel.onchange = () => this.renderExpenseList();

    this.renderExpenseList();
  },

  renderExpenseList() {
    const filter   = document.getElementById('expenseMonthFilter')?.value || 'all';
    const expenses = Calc.filterByMonth(Data.getExpenses(), filter !== 'all' ? filter : null);
    const sorted   = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
    const total    = Calc.sum(sorted);
    const container = document.getElementById('expenseList');

    if (!sorted.length) {
      container.innerHTML = `<p class="empty-state">Nenhuma despesa no período selecionado.</p>`;
      return;
    }

    container.innerHTML =
      `<div class="list-total">Total: <strong>${this.fmt(total)}</strong></div>` +
      sorted.map((e, idx) => {
        const typeClass = e.expenseType === 'Fixo' ? 'fi-type-fixed' : 'fi-type-var';
        return `
        <div class="finance-item expense fade-in" style="animation-delay:${idx * 0.035}s">
          <div class="fi-left">
            <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
              <span class="fi-badge expense-badge">${e.category}</span>
              <span class="${typeClass}">${e.expenseType || 'Variável'}</span>
              <span class="fi-payment">${e.payment}</span>
            </div>
            <span class="fi-desc">${e.description || '—'}</span>
          </div>
          <div class="fi-right">
            <span class="fi-amount expense">−${this.fmt(e.amount)}</span>
            <span class="fi-date">${this.fmtDate(e.date)}</span>
            <button class="delete-btn" onclick="deleteExpense('${e.id}')" title="Excluir">×</button>
          </div>
        </div>
      `}).join('');
  },

  // ---- RELATÓRIOS ----

  renderReports() {
    const month = this._currentMonth();
    this.populateMonthFilter('reportMonthFilter', month);

    const sel = document.getElementById('reportMonthFilter');
    if (sel) sel.onchange = () => this._updateReports();

    this._updateReports();
  },

  _updateReports() {
    const filter   = document.getElementById('reportMonthFilter')?.value || 'all';
    const mth      = filter !== 'all' ? filter : null;
    const incomes  = Calc.filterByMonth(Data.getIncomes(),  mth);
    const expenses = Calc.filterByMonth(Data.getExpenses(), mth);
    const totalIn  = Calc.sum(incomes);
    const totalEx  = Calc.sum(expenses);
    const savings  = totalIn - totalEx;
    const savRate  = totalIn > 0 ? ((savings / totalIn) * 100).toFixed(1) : '0';

    document.getElementById('reportSummary').innerHTML = `
      <div class="report-row">
        <span class="report-label">Total de Receitas</span>
        <span class="report-value income">${this.fmt(totalIn)}</span>
      </div>
      <div class="report-row">
        <span class="report-label">Total de Despesas</span>
        <span class="report-value expense">${this.fmt(totalEx)}</span>
      </div>
      <div class="report-row report-row-total">
        <span class="report-label">Saldo do Período</span>
        <span class="report-value ${savings >= 0 ? 'income' : 'expense'}">${this.fmt(savings)}</span>
      </div>
      <div class="report-row">
        <span class="report-label">Taxa de Poupança</span>
        <span class="report-value">${savRate}%</span>
      </div>
      <div class="report-row">
        <span class="report-label">Nº de Transações</span>
        <span class="report-value">${incomes.length + expenses.length}</span>
      </div>
    `;

    Charts.drawPie('expensePieChart', Calc.groupByCategory(expenses));

    const fixedTotal = Calc.sum(expenses.filter(e => e.expenseType === 'Fixo'));
    const varTotal   = Calc.sum(expenses.filter(e => e.expenseType !== 'Fixo'));
    const fvEl = document.getElementById('fixedVarBreakdown');
    if (fvEl) {
      if (!totalEx) {
        fvEl.innerHTML = `<p class="empty-state">Sem despesas no período.</p>`;
      } else {
        const fPct = (fixedTotal / totalEx * 100).toFixed(1);
        const vPct = (varTotal   / totalEx * 100).toFixed(1);
        fvEl.innerHTML = `
          <div class="fv-row">
            <span class="fv-label">Fixo</span>
            <div class="fv-bar-wrap"><div class="fv-bar-fixed" style="width:${fPct}%"></div></div>
            <span class="fv-pct">${fPct}%</span>
            <span class="fv-value">${this.fmt(fixedTotal)}</span>
          </div>
          <div class="fv-row">
            <span class="fv-label">Variável</span>
            <div class="fv-bar-wrap"><div class="fv-bar-var" style="width:${vPct}%"></div></div>
            <span class="fv-pct">${vPct}%</span>
            <span class="fv-value">${this.fmt(varTotal)}</span>
          </div>`;
      }
    }

    const byPayment = Calc.groupByPayment(expenses);
    const payKeys   = Object.keys(byPayment).sort((a, b) => byPayment[b] - byPayment[a]);
    const breakEl   = document.getElementById('cardBreakdown');

    breakEl.innerHTML = payKeys.length
      ? payKeys.map(p => {
          const pct = totalEx > 0 ? (byPayment[p] / totalEx * 100).toFixed(1) : 0;
          return `
            <div class="breakdown-row">
              <span class="breakdown-label">${p}</span>
              <div class="breakdown-bar-wrap">
                <div class="breakdown-bar" style="width:${pct}%"></div>
              </div>
              <span class="breakdown-value">${this.fmt(byPayment[p])}</span>
            </div>
          `;
        }).join('')
      : `<p class="empty-state">Sem despesas no período selecionado.</p>`;
  },

  // ---- METAS ----

  renderGoals() {
    const reserve = Data.getReserve();

    const goalInput    = document.getElementById('reserveGoalInput');
    const currentInput = document.getElementById('reserveCurrentInput');
    if (goalInput)    goalInput.value    = reserve.goal    || '';
    if (currentInput) currentInput.value = reserve.current || '';

    const notesEl = document.getElementById('investmentNotes');
    if (notesEl) notesEl.value = Data.getNotes();

    this.renderGoalsList();
  },

  renderGoalsList() {
    const goals     = Data.getGoals();
    const container = document.getElementById('goalsList');

    if (!goals.length) {
      container.innerHTML = `<p class="empty-state">Nenhum objetivo cadastrado ainda.<br>Adicione um acima!</p>`;
      return;
    }

    const month       = this._currentMonth();
    const monthIncome = Calc.sum(Calc.filterByMonth(Data.getIncomes(), month));

    container.innerHTML = goals.map((g, idx) => {
      const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
      const done = pct >= 100;

      let badgeHtml = '';
      let hintHtml  = '';

      if (g.contribType === 'fixed' && g.contribValue > 0) {
        badgeHtml = `<span class="contrib-badge contrib-fixed">Fixo ${this.fmt(g.contribValue)}/mês</span>`;
        const months = g.current < g.target
          ? Math.ceil((g.target - g.current) / g.contribValue)
          : 0;
        hintHtml = done
          ? `<span class="goal-contrib-hint">✓ Meta atingida!</span>`
          : `<span class="goal-contrib-hint">→ Faltam <strong>${this.fmt(g.target - g.current)}</strong> · ~<strong>${months} meses</strong></span>`;
      } else if (g.contribType === 'percent' && g.contribValue > 0) {
        const monthly = monthIncome * (g.contribValue / 100);
        badgeHtml = `<span class="contrib-badge contrib-percent">${g.contribValue}% da renda</span>`;
        const months = monthly > 0 && g.current < g.target
          ? Math.ceil((g.target - g.current) / monthly)
          : '—';
        hintHtml = done
          ? `<span class="goal-contrib-hint">✓ Meta atingida!</span>`
          : `<span class="goal-contrib-hint">→ Sugerido: <strong>${this.fmt(monthly)}/mês</strong> · ~<strong>${months} meses</strong></span>`;
      }

      return `
        <div class="goal-item fade-in" style="animation-delay:${idx * 0.05}s" id="goal-item-${g.id}">
          <div class="goal-header">
            <span class="goal-title">${done ? '✓ ' : ''}${g.title}</span>
            ${badgeHtml}
            <div class="goal-controls">
              <button class="aporte-btn" onclick="openContribModal('${g.id}')">Aportar</button>
              <button class="delete-btn" onclick="deleteGoal('${g.id}')" title="Excluir meta">×</button>
            </div>
          </div>
          <div class="goal-amounts">
            <span>${this.fmt(g.current)}</span>
            <span class="goal-sep">/</span>
            <span>${this.fmt(g.target)}</span>
            <span class="goal-pct">${pct.toFixed(0)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%;${done ? 'background:var(--accent)' : ''}"></div>
          </div>
          ${hintHtml}
        </div>
      `;
    }).join('');
  },

  _currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
};

// ============================================================
// 6. CHARTS MODULE
// ============================================================

const Charts = {

  palette: [
    '#00e5a0', '#8b67f8', '#ff4b6e', '#ffc542',
    '#00b8ff', '#ff67c3', '#4ade80', '#fb923c',
    '#38bdf8', '#a78bfa'
  ],

  drawPie(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx   = canvas.getContext('2d');
    const parentW = canvas.parentElement?.clientWidth || 280;
    const size  = Math.min(parentW - 32, 260);
    canvas.width  = size;
    canvas.height = size;

    const cx = size / 2;
    const cy = size / 2;
    const r  = size / 2 - 14;

    ctx.clearRect(0, 0, size, size);

    const keys  = Object.keys(data);
    const total = Object.values(data).reduce((a, b) => a + b, 0);

    if (!total || !keys.length) {
      ctx.fillStyle = '#171d2e';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#38475c';
      ctx.font      = '13px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sem despesas', cx, cy + 5);

      document.getElementById('chartLegend').innerHTML = '';
      return;
    }

    let startAngle = -Math.PI / 2;
    const slices   = keys.map((key, i) => {
      const value = data[key];
      const angle = (value / total) * Math.PI * 2;
      const slice = {
        key, value,
        startAngle,
        angle,
        color: this.palette[i % this.palette.length]
      };
      startAngle += angle;
      return slice;
    });

    slices.forEach(s => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, s.startAngle, s.startAngle + s.angle);
      ctx.closePath();
      ctx.fillStyle   = s.color;
      ctx.fill();
      ctx.strokeStyle = '#10141f';
      ctx.lineWidth   = 2;
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.54, 0, Math.PI * 2);
    ctx.fillStyle = '#10141f';
    ctx.fill();

    ctx.textAlign  = 'center';
    ctx.fillStyle  = '#edf2f8';
    ctx.font       = `bold 11px Syne, sans-serif`;
    ctx.fillText('Despesas', cx, cy - 8);

    ctx.fillStyle = '#7f8fa8';
    ctx.font      = `500 10px JetBrains Mono, monospace`;
    ctx.fillText(
      total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      cx, cy + 10
    );

    const legendEl = document.getElementById('chartLegend');
    if (legendEl) {
      legendEl.innerHTML = slices.map(s => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${s.color}"></span>
          <span class="legend-label">${s.key}</span>
          <span class="legend-pct">${((s.value / total) * 100).toFixed(1)}%</span>
        </div>
      `).join('');
    }
  }
};

// ============================================================
// 7. FORM HANDLERS
// ============================================================

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  ['incomeDate', 'expenseDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
}

function handleIncomeSubmit(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('incomeAmount').value);

  if (!amount || amount <= 0) {
    UI.toast('Informe um valor válido.', 'error');
    return;
  }

  Data.addIncome({
    amount,
    source:      document.getElementById('incomeSource').value,
    date:        document.getElementById('incomeDate').value,
    description: document.getElementById('incomeDesc').value.trim()
  });

  e.target.reset();
  setDefaultDates();
  UI.toast('Receita adicionada! 💚');

  // Abre o histórico para o usuário ver
  switchInnerTab('incomes', 'list');
  UI.renderIncomeList();
  UI.renderDashboard();
}

function handleExpenseSubmit(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('expenseAmount').value);

  if (!amount || amount <= 0) {
    UI.toast('Informe um valor válido.', 'error');
    return;
  }

  Data.addExpense({
    amount,
    expenseType: document.getElementById('expenseType').value,
    category:    document.getElementById('expenseCategory').value,
    payment:     document.getElementById('expensePayment').value,
    date:        document.getElementById('expenseDate').value,
    description: document.getElementById('expenseDesc').value.trim()
  });

  e.target.reset();
  setDefaultDates();
  UI.toast('Despesa registrada! 🔴');

  switchInnerTab('expenses', 'list');
  UI.renderExpenseList();
  UI.renderDashboard();
}

function handleReserveSubmit(e) {
  e.preventDefault();
  Data.saveReserve({
    goal:    parseFloat(document.getElementById('reserveGoalInput').value)    || 0,
    current: parseFloat(document.getElementById('reserveCurrentInput').value) || 0
  });
  UI.toast('Reserva de emergência salva! 🛡️');
}

function handleGoalSubmit(e) {
  e.preventDefault();
  const title  = document.getElementById('goalTitle').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);

  if (!title || !target || target <= 0) {
    UI.toast('Preencha nome e valor alvo da meta.', 'error');
    return;
  }

  Data.addGoal({
    title,
    target,
    current:      parseFloat(document.getElementById('goalCurrent').value) || 0,
    contribType:  document.getElementById('goalContribType').value,
    contribValue: parseFloat(document.getElementById('goalContribValue').value) || 0
  });

  e.target.reset();
  document.getElementById('contribValueGroup').style.display = 'none';
  UI.toast('Meta adicionada! 🎯');
  UI.renderGoalsList();
}

function toggleContribInput() {
  const type  = document.getElementById('goalContribType').value;
  const group = document.getElementById('contribValueGroup');
  const label = document.getElementById('contribValueLabel');

  if (type === 'none') {
    group.style.display = 'none';
  } else {
    group.style.display = 'flex';
    label.textContent   = type === 'fixed' ? 'Valor fixo (R$/mês)' : 'Percentual (%)';
    document.getElementById('goalContribValue').placeholder =
      type === 'fixed' ? 'Ex: 500' : 'Ex: 10';
  }
}

// ============================================================
// MODAL DE APORTE
// ============================================================

let _modalGoalId = null;

function openContribModal(id) {
  const goals = Data.getGoals();
  const goal  = goals.find(g => g.id === id);
  if (!goal) return;

  _modalGoalId = id;

  const month       = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  const monthIncome = Calc.sum(Calc.filterByMonth(Data.getIncomes(), month));

  const pct = goal.target > 0 ? Math.min(100, (goal.current / goal.target * 100)) : 0;

  document.getElementById('modalGoalTitle').textContent  = goal.title;
  document.getElementById('modalCurrent').textContent    = UI.fmt(goal.current);
  document.getElementById('modalTarget').textContent     = UI.fmt(goal.target);
  document.getElementById('modalPct').textContent        = `${pct.toFixed(0)}%`;
  document.getElementById('modalProgress').style.width   = `${pct}%`;
  document.getElementById('modalAddAmount').value        = '';
  document.getElementById('modalSetAmount').value        = '';

  let hint = '';
  if (goal.contribType === 'fixed' && goal.contribValue > 0) {
    hint = `Aporte definido: ${UI.fmt(goal.contribValue)}/mês`;
    document.getElementById('modalAddAmount').value = goal.contribValue;
  } else if (goal.contribType === 'percent' && goal.contribValue > 0) {
    const monthly = monthIncome * (goal.contribValue / 100);
    hint = `${goal.contribValue}% da renda = ${UI.fmt(monthly)}/mês`;
    document.getElementById('modalAddAmount').value = monthly.toFixed(2);
  }
  document.getElementById('modalContribHint').textContent = hint;

  document.getElementById('contribModal').classList.add('open');
  // Previne scroll no body quando modal aberto
  document.body.style.overflow = 'hidden';
}

function closeContribModal(event) {
  if (event && event.target !== document.getElementById('contribModal')) return;
  document.getElementById('contribModal').classList.remove('open');
  document.body.style.overflow = '';
  _modalGoalId = null;
}

function applyContrib(mode) {
  if (!_modalGoalId) return;

  const goal = Data.getGoals().find(g => g.id === _modalGoalId);
  if (!goal) return;

  const inputId = mode === 'add' ? 'modalAddAmount' : 'modalSetAmount';
  const val     = parseFloat(document.getElementById(inputId).value);

  if (!val || val < 0) {
    UI.toast('Informe um valor válido.', 'error');
    return;
  }

  const newCurrent = mode === 'add' ? goal.current + val : val;
  Data.updateGoalCurrent(_modalGoalId, newCurrent);

  const updated = Data.getGoals().find(g => g.id === _modalGoalId);
  const pct     = updated.target > 0 ? Math.min(100, (updated.current / updated.target * 100)) : 0;

  document.getElementById('modalCurrent').textContent  = UI.fmt(updated.current);
  document.getElementById('modalPct').textContent      = `${pct.toFixed(0)}%`;
  document.getElementById('modalProgress').style.width = `${pct}%`;
  document.getElementById(inputId).value               = '';

  UI.renderGoalsList();

  const msg = pct >= 100
    ? '🎉 Meta atingida! Parabéns!'
    : mode === 'add'
      ? `Aporte de ${UI.fmt(val)} registrado!`
      : `Saldo atualizado para ${UI.fmt(val)}`;

  UI.toast(msg, pct >= 100 ? 'success' : 'info');
}

function saveNotes() {
  Data.saveNotes(document.getElementById('investmentNotes').value);
  UI.toast('Anotações salvas! 📝');
}

function deleteIncome(id) {
  if (!confirm('Excluir esta receita?')) return;
  Data.deleteIncome(id);
  UI.renderIncomeList();
  UI.toast('Receita excluída.', 'info');
}

function deleteExpense(id) {
  if (!confirm('Excluir esta despesa?')) return;
  Data.deleteExpense(id);
  UI.renderExpenseList();
  UI.toast('Despesa excluída.', 'info');
}

function deleteGoal(id) {
  if (!confirm('Excluir esta meta?')) return;
  Data.deleteGoal(id);
  UI.renderGoalsList();
  UI.toast('Meta excluída.', 'info');
}

// ============================================================
// CSV EXPORT MODULE
// ============================================================

const CSV = {

  cell(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  },

  row(cells) {
    return cells.map(c => this.cell(c)).join(',');
  },

  download(filename, content, mime = 'text/csv;charset=utf-8;') {
    const blob = new Blob(['\uFEFF' + content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },

  buildIncomes() {
    const header = this.row(['Data', 'Fonte', 'Valor', 'Descrição']);
    const rows   = Data.getIncomes()
      .sort((a, b) => a.date?.localeCompare(b.date))
      .map(i => this.row([i.date, i.source, i.amount.toFixed(2), i.description]));
    return [header, ...rows].join('\n');
  },

  buildExpenses() {
    const header = this.row(['Data', 'Tipo', 'Categoria', 'Pagamento', 'Valor', 'Descrição']);
    const rows   = Data.getExpenses()
      .sort((a, b) => a.date?.localeCompare(b.date))
      .map(e => this.row([e.date, e.expenseType || 'Variável', e.category, e.payment, e.amount.toFixed(2), e.description]));
    return [header, ...rows].join('\n');
  },

  buildAll() {
    const header = this.row(['Data', 'Lançamento', 'Tipo', 'Categoria/Fonte', 'Pagamento', 'Valor', 'Descrição']);
    const inc = Data.getIncomes().map(i => this.row([
      i.date, 'Receita', '—', i.source, '—', i.amount.toFixed(2), i.description
    ]));
    const exp = Data.getExpenses().map(e => this.row([
      e.date, 'Despesa', e.expenseType || 'Variável', e.category, e.payment, (-e.amount).toFixed(2), e.description
    ]));
    const all = [...inc, ...exp].sort();
    return [header, ...all].join('\n');
  }
};

function exportCSV(type) {
  const date = new Date().toISOString().slice(0, 10);
  if (type === 'incomes') {
    CSV.download(`fluxo-receitas-${date}.csv`, CSV.buildIncomes());
    UI.toast('Receitas exportadas! 📥');
  } else if (type === 'expenses') {
    CSV.download(`fluxo-despesas-${date}.csv`, CSV.buildExpenses());
    UI.toast('Despesas exportadas! 📥');
  } else {
    CSV.download(`fluxo-completo-${date}.csv`, CSV.buildAll());
    UI.toast('Exportação completa! 📥');
  }
}

// ============================================================
// SUPABASE MODULE
// ============================================================

const Supabase = {

  getCreds() {
    return Storage.load('supabase_creds', { url: '', key: '' });
  },

  saveCreds(url, key) {
    Storage.save('supabase_creds', { url: url.trim(), key: key.trim() });
  },

  headers(key) {
    return {
      'Content-Type':  'application/json',
      'apikey':         key,
      'Authorization': `Bearer ${key}`,
      'Prefer':        'resolution=merge-duplicates'
    };
  },

  async testConnection(url, key) {
    try {
      const res = await fetch(`${url}/rest/v1/fluxo_incomes?limit=1`, {
        headers: this.headers(key)
      });
      if (res.ok || res.status === 404) {
        return { ok: true, msg: 'Conexão bem-sucedida!' };
      }
      const err = await res.json().catch(() => ({}));
      return { ok: false, msg: err.message || `Erro HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, msg: `Falha de rede: ${e.message}` };
    }
  },

  async pushAll(url, key) {
    const tables = {
      fluxo_incomes:  Data.getIncomes(),
      fluxo_expenses: Data.getExpenses(),
      fluxo_goals:    Data.getGoals()
    };

    for (const [table, items] of Object.entries(tables)) {
      if (!items.length) continue;
      const body = items.map(i => ({ id: i.id, data: i }));
      const res  = await fetch(`${url}/rest/v1/${table}`, {
        method:  'POST',
        headers: this.headers(key),
        body:    JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Tabela ${table}: ${err.message || res.status}`);
      }
    }
  },

  async pullAll(url, key) {
    const map = {
      fluxo_incomes:  'incomes',
      fluxo_expenses: 'expenses',
      fluxo_goals:    'goals'
    };

    for (const [table, localKey] of Object.entries(map)) {
      const res = await fetch(`${url}/rest/v1/${table}?select=data`, {
        headers: this.headers(key)
      });
      if (!res.ok) throw new Error(`Tabela ${table}: HTTP ${res.status}`);
      const rows = await res.json();
      Storage.save(localKey, rows.map(r => r.data));
    }
  }
};

async function connectSupabase() {
  const url = document.getElementById('sbUrl')?.value.trim();
  const key = document.getElementById('sbKey')?.value.trim();

  if (!url || !key) {
    UI.toast('Preencha a URL e a chave do Supabase.', 'error');
    return;
  }

  setSupabaseStatus('connecting', 'Testando conexão...');
  const result = await Supabase.testConnection(url, key);

  if (result.ok) {
    Supabase.saveCreds(url, key);
    setSupabaseStatus('connected', 'Conectado ✓');
    UI.toast('Conexão com Supabase estabelecida! ☁️');
  } else {
    setSupabaseStatus('error', `Erro: ${result.msg}`);
    UI.toast(`Falha: ${result.msg}`, 'error');
  }
}

async function syncToSupabase() {
  const creds = Supabase.getCreds();
  if (!creds.url || !creds.key) {
    UI.toast('Configure e teste a conexão primeiro.', 'error');
    return;
  }
  setSupabaseStatus('connecting', 'Enviando dados...');
  try {
    await Supabase.pushAll(creds.url, creds.key);
    setSupabaseStatus('connected', 'Sincronizado ✓');
    UI.toast('Dados enviados para o Supabase! ☁️');
  } catch (e) {
    setSupabaseStatus('error', `Erro: ${e.message}`);
    UI.toast(`Falha ao sincronizar: ${e.message}`, 'error');
  }
}

async function syncFromSupabase() {
  const creds = Supabase.getCreds();
  if (!creds.url || !creds.key) {
    UI.toast('Configure e teste a conexão primeiro.', 'error');
    return;
  }
  if (!confirm('Isso vai substituir todos os dados locais pelos dados do Supabase. Continuar?')) return;
  setSupabaseStatus('connecting', 'Importando dados...');
  try {
    await Supabase.pullAll(creds.url, creds.key);
    setSupabaseStatus('connected', 'Importado ✓');
    UI.toast('Dados importados do Supabase! ☁️');
    UI.renderSection(Nav.current);
  } catch (e) {
    setSupabaseStatus('error', `Erro: ${e.message}`);
    UI.toast(`Falha ao importar: ${e.message}`, 'error');
  }
}

function setSupabaseStatus(state, text) {
  const dot  = document.getElementById('statusDot');
  const txt  = document.getElementById('statusText');
  if (!dot || !txt) return;
  dot.className = `status-dot ${state}`;
  txt.textContent = text;
}

function renderSettings() {
  const creds = Supabase.getCreds();
  const urlEl = document.getElementById('sbUrl');
  const keyEl = document.getElementById('sbKey');
  if (urlEl && creds.url) urlEl.value = creds.url;
  if (keyEl && creds.key) keyEl.value = creds.key;
  if (creds.url && creds.key) {
    setSupabaseStatus('connected', 'Credenciais salvas');
  }
}

function clearAllData() {
  const confirm1 = confirm('⚠️ Isso apagará TODOS os dados locais (receitas, despesas, metas). Esta ação não pode ser desfeita.\n\nDeseja continuar?');
  if (!confirm1) return;
  const confirm2 = confirm('Tem CERTEZA? Considere exportar um CSV primeiro.');
  if (!confirm2) return;
  ['incomes', 'expenses', 'goals', 'reserve', 'notes'].forEach(k => Storage.remove(k));
  UI.toast('Todos os dados locais foram apagados.', 'info');
  Nav.navigateTo('dashboard');
}

const _origRenderSection = UI.renderSection.bind(UI);
UI.renderSection = function(section) {
  if (section === 'settings') { renderSettings(); return; }
  _origRenderSection(section);
};

// ============================================================
// PWA — Service Worker + Install Prompt
// ============================================================

// Registra o SW
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Falha:', err));
  });
}

// Captura o evento de instalação
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;

  // Mostra o card de instalação
  const card = document.getElementById('installCard');
  if (card) card.style.display = 'block';
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  const card = document.getElementById('installCard');
  if (card) card.style.display = 'none';
  UI.toast('Fluxo instalado! 🎉 Abra pela tela inicial.');
});

// Botão de instalar
document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!_deferredInstallPrompt) {
        UI.toast('Use o menu do navegador para instalar.', 'info');
        return;
      }
      _deferredInstallPrompt.prompt();
      const { outcome } = await _deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        UI.toast('Instalando o Fluxo... 📲');
      }
      _deferredInstallPrompt = null;
    });
  }
});

// ============================================================
// 8. DESKTOP SIDEBAR — renderiza nav lateral no desktop
// ============================================================

function renderDesktopSidebar() {
  // Injeta sidebar se não existir
  if (document.querySelector('.desktop-sidebar')) return;

  const sidebar = document.createElement('aside');
  sidebar.className = 'desktop-sidebar';
  sidebar.innerHTML = `
    <div class="ds-brand">
      <span style="font-size:1.3rem;color:var(--accent)">◈</span>
      <span style="font-family:var(--font-head);font-weight:800;font-size:1rem;
        background:linear-gradient(135deg,var(--accent),#79f5d0);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">
        Fluxo
      </span>
    </div>
    <nav class="ds-nav">
      ${[
        { s: 'dashboard', icon: '⬡', label: 'Dashboard' },
        { s: 'incomes',   icon: '↑', label: 'Receitas' },
        { s: 'expenses',  icon: '↓', label: 'Despesas' },
        { s: 'reports',   icon: '◎', label: 'Relatórios' },
        { s: 'goals',     icon: '◇', label: 'Metas' },
        { s: 'settings',  icon: '⚙', label: 'Config' },
      ].map(({ s, icon, label }) => `
        <button class="ds-nav-item ${s === Nav.current ? 'active' : ''}" data-section="${s}">
          <span class="ds-icon">${icon}</span>
          <span>${label}</span>
        </button>
      `).join('')}
    </nav>
  `;

  sidebar.querySelectorAll('.ds-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      if (!section) return;
      sidebar.querySelectorAll('.ds-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Nav.navigateTo(section);
    });
  });

  document.body.prepend(sidebar);
  injectDesktopSidebarStyle();
}

function injectDesktopSidebarStyle() {
  if (document.getElementById('ds-style')) return;
  const style = document.createElement('style');
  style.id = 'ds-style';
  style.textContent = `
    .desktop-sidebar {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: var(--sidebar-w, 220px);
      background: var(--bg-1);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 24px 12px;
      z-index: 200;
    }
    .ds-brand {
      display: flex; align-items: center; gap: 8px;
      padding: 0 8px 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .ds-nav { display: flex; flex-direction: column; gap: 3px; }
    .ds-nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 11px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-1);
      font-family: var(--font-body);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all var(--t) var(--ease);
      text-align: left; width: 100%;
    }
    .ds-nav-item:hover { color: var(--text-0); background: var(--bg-3); border-color: var(--border-hi); }
    .ds-nav-item.active { color: var(--accent); background: var(--accent-dim); border-color: rgba(0,229,160,0.15); font-weight: 500; }
    .ds-icon { width: 18px; text-align: center; }
    @media (max-width: 767px) { .desktop-sidebar { display: none !important; } }
  `;
  document.head.appendChild(style);
}

// ============================================================
// 8. INIT
// ============================================================

function init() {
  // Mês atual no header
  const monthEl = document.getElementById('currentMonthDisplay');
  if (monthEl) {
    monthEl.textContent = new Date().toLocaleDateString('pt-BR', {
      month: 'long',
      year:  'numeric'
    });
  }

  setDefaultDates();

  // Form handlers
  document.getElementById('incomeForm')   ?.addEventListener('submit', handleIncomeSubmit);
  document.getElementById('expenseForm')  ?.addEventListener('submit', handleExpenseSubmit);
  document.getElementById('reserveForm')  ?.addEventListener('submit', handleReserveSubmit);
  document.getElementById('goalItemForm') ?.addEventListener('submit', handleGoalSubmit);

  // ESC fecha modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeContribModal(null);
  });

  // Bottom nav
  document.querySelectorAll('.bnav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      if (section) Nav.navigateTo(section);
    });
  });

  // Desktop: renderiza sidebar se tela grande
  const mq = window.matchMedia('(min-width: 768px)');
  if (mq.matches) renderDesktopSidebar();
  mq.addEventListener('change', e => {
    if (e.matches) renderDesktopSidebar();
    else {
      document.querySelector('.desktop-sidebar')?.remove();
    }
  });

  Nav.navigateTo('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
