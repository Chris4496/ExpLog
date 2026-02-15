// ExpLog - Expense Tracker App

const STORAGE_KEY = 'explog_expenses';

const categoryEmojis = {
  general: '💰',
  food: '🍔',
  transport: '🚌',
  shopping: '🛍️',
  bills: '📄',
  entertainment: '🎬',
  health: '💊',
  other: '📦'
};

// State
let expenses = [];
let lastDeleted = null;
let toastTimeout = null;

// DOM
const form = document.getElementById('expenseForm');
const amountInput = document.getElementById('amountInput');
const noteInput = document.getElementById('noteInput');
const categorySelect = document.getElementById('categorySelect');
const expenseList = document.getElementById('expenseList');
const emptyState = document.getElementById('emptyState');
const monthLabel = document.getElementById('monthLabel');
const monthTotal = document.getElementById('monthTotal');
const toast = document.getElementById('toast');
const exportBtn = document.getElementById('exportBtn');

// Init
function init() {
  loadExpenses();
  renderExpenses();
  updateMonthSummary();

  form.addEventListener('submit', handleSubmit);
  exportBtn.addEventListener('click', exportToCSV);

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/ExpLog/sw.js', { scope: '/ExpLog/' }).catch(() => {});
  }
}

// Storage
function loadExpenses() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    expenses = data ? JSON.parse(data) : [];
  } catch {
    expenses = [];
  }
}

function saveExpenses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

// Handle form submit
function handleSubmit(e) {
  e.preventDefault();

  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) {
    amountInput.focus();
    return;
  }

  const expense = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    amount: Math.round(amount * 100) / 100,
    note: noteInput.value.trim() || getCategoryLabel(categorySelect.value),
    category: categorySelect.value,
    timestamp: Date.now()
  };

  expenses.unshift(expense);
  saveExpenses();
  renderExpenses();
  updateMonthSummary();

  // Reset form
  amountInput.value = '';
  noteInput.value = '';
  amountInput.focus();

  // Brief haptic feedback if available
  if (navigator.vibrate) navigator.vibrate(10);
}

function getCategoryLabel(cat) {
  const labels = {
    general: 'Expense',
    food: 'Food',
    transport: 'Transport',
    shopping: 'Shopping',
    bills: 'Bills',
    entertainment: 'Entertainment',
    health: 'Health',
    other: 'Other'
  };
  return labels[cat] || 'Expense';
}

// Render
function renderExpenses() {
  // Group by day
  const groups = groupByDay(expenses);

  if (expenses.length === 0) {
    expenseList.innerHTML = '';
    expenseList.appendChild(emptyState);
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  expenseList.innerHTML = '';

  for (const [dateKey, items] of Object.entries(groups)) {
    const group = document.createElement('div');
    group.className = 'day-group';

    const dayTotal = items.reduce((sum, e) => sum + e.amount, 0);

    group.innerHTML = `
      <div class="day-header">
        <span class="day-label">${formatDayLabel(dateKey)}</span>
        <span class="day-total">$${formatAmount(dayTotal)}</span>
      </div>
    `;

    items.forEach((expense, index) => {
      const el = createExpenseElement(expense);
      if (index === 0 && dateKey === Object.keys(groups)[0] && isNewlyAdded(expense)) {
        el.classList.add('new');
      }
      group.appendChild(el);
    });

    expenseList.appendChild(group);
  }
}

function isNewlyAdded(expense) {
  return Date.now() - expense.timestamp < 1000;
}

function createExpenseElement(expense) {
  const el = document.createElement('div');
  el.className = 'expense-item';
  el.dataset.id = expense.id;

  const time = new Date(expense.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  el.innerHTML = `
    <div class="expense-category">${categoryEmojis[expense.category] || '💰'}</div>
    <div class="expense-details">
      <div class="expense-note">${escapeHtml(expense.note)}</div>
      <div class="expense-time">${timeStr}</div>
    </div>
    <div class="expense-amount">$${formatAmount(expense.amount)}</div>
    <button class="expense-delete" aria-label="Delete expense">🗑️</button>
  `;

  // Swipe to delete (touch)
  let startX = 0;
  let currentX = 0;
  let swiping = false;

  el.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    swiping = true;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!swiping) return;
    currentX = e.touches[0].clientX;
    const diff = startX - currentX;
    if (diff > 50) {
      el.classList.add('swiped');
    } else {
      el.classList.remove('swiped');
    }
  }, { passive: true });

  el.addEventListener('touchend', () => {
    swiping = false;
  });

  // Click anywhere else to un-swipe
  document.addEventListener('touchstart', (e) => {
    if (!el.contains(e.target)) {
      el.classList.remove('swiped');
    }
  }, { passive: true });

  // Delete button
  const deleteBtn = el.querySelector('.expense-delete');
  deleteBtn.addEventListener('click', () => deleteExpense(expense.id, el));

  // Long press to delete on desktop
  let longPressTimer;
  el.addEventListener('mousedown', () => {
    longPressTimer = setTimeout(() => {
      deleteExpense(expense.id, el);
    }, 600);
  });
  el.addEventListener('mouseup', () => clearTimeout(longPressTimer));
  el.addEventListener('mouseleave', () => clearTimeout(longPressTimer));

  return el;
}

function deleteExpense(id, el) {
  const index = expenses.findIndex(e => e.id === id);
  if (index === -1) return;

  lastDeleted = { expense: expenses[index], index };

  el.classList.add('removing');
  setTimeout(() => {
    expenses.splice(index, 1);
    saveExpenses();
    renderExpenses();
    updateMonthSummary();
  }, 200);

  showToast('Expense deleted', true);

  if (navigator.vibrate) navigator.vibrate(10);
}

function undoDelete() {
  if (!lastDeleted) return;

  expenses.splice(lastDeleted.index, 0, lastDeleted.expense);
  lastDeleted = null;
  saveExpenses();
  renderExpenses();
  updateMonthSummary();
  hideToast();
}

// Month summary
function updateMonthSummary() {
  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  monthLabel.textContent = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  monthTotal.textContent = `$${formatAmount(total)}`;
}

// Export to CSV
function exportToCSV() {
  if (expenses.length === 0) {
    showToast('No expenses to export');
    return;
  }

  const headers = ['Date', 'Time', 'Category', 'Note', 'Amount'];
  const rows = expenses.map(e => {
    const d = new Date(e.timestamp);
    const date = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const category = getCategoryLabel(e.category);
    const note = `"${e.note.replace(/"/g, '""')}"`;
    const amount = e.amount.toFixed(2);
    return [date, time, category, note, amount].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });

  const now = new Date();
  const filename = `explog_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;

  // Try native share on mobile, fallback to download
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'text/csv' });
    if (navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: 'ExpLog Export',
      }).catch(() => downloadBlob(blob, filename));
      return;
    }
  }

  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exported as CSV ✓');
}

// Grouping
function groupByDay(items) {
  const groups = {};
  items.forEach(expense => {
    const d = new Date(expense.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(expense);
  });
  return groups;
}

function formatDayLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function isSameDay(a, b) {
  return a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
}

// Utilities
function formatAmount(num) {
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Toast
function showToast(message, withUndo = false) {
  if (toastTimeout) clearTimeout(toastTimeout);

  toast.innerHTML = message + (withUndo
    ? '<button class="undo-btn" onclick="undoDelete()">UNDO</button>'
    : '');
  toast.classList.add('show');

  toastTimeout = setTimeout(hideToast, 4000);
}

function hideToast() {
  toast.classList.remove('show');
  if (toastTimeout) clearTimeout(toastTimeout);
}

// Start
init();
