
    let transactions = [];
    let piggybanks = new Map();
    
    // API Helper
    async function apiCall(endpoint, method = 'GET', data = null) {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      if (data) {
        options.body = JSON.stringify(data);
      }
      try {
        const response = await fetch(endpoint, options);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
      } catch (error) {
        console.error('API Error:', error);
        showToast('Error de conexión', 'error');
        return null;
      }
    }

    async function initApp() {
      await loadData();
      setupEventListeners();
      
      // Initial UI updates
      updateBalance();
      updateOtherCurrencySelector();
    }
    
    async function loadData() {
      const data = await apiCall('/api/data');
      if (data) {
        transactions = data.transactions || [];
        // Convert array back to Map for piggybanks
        piggybanks.clear();
        (data.piggybanks || []).forEach(pb => {
             // Backend uses 'concept' and 'amount', Frontend uses 'name' and 'goal'
             // Map them correctly here to avoid crashes in renderPiggybanks
             piggybanks.set(pb.id, {
                 ...pb,
                 name: pb.concept,
                 goal: pb.amount,
                 current: 0, // Will be calculated in updatePiggybanks
                 completed: false
             });
        });
        updateUI();
      }
    }

    // Placeholder for elementSdk (retained for structure but simplified)
    function updateOtherCurrencySelector() {
        // No-op for now
    }

    let editingTransaction = null;
    
    function setupEventListeners() {
      const btnDeleteAll = document.getElementById('btn-delete-all');
      if (btnDeleteAll) {
          btnDeleteAll.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas borrar todos los datos?')) {
                const result = await apiCall('/api/data', 'DELETE');
                if (result && result.success) {
                    showToast('Todos los datos han sido borrados', 'success');
                    loadData();
                } else {
                    showToast('Error al borrar los datos', 'error');
                }
            }
          });
      }

      document.getElementById('btn-add-income').addEventListener('click', () => {
        updatePiggybankSelects();
        document.getElementById('modal-income').style.display = 'flex';
      });
      
      document.getElementById('btn-add-expense').addEventListener('click', () => {
        updatePiggybankSelects();
        document.getElementById('modal-expense').style.display = 'flex';
      });
      
      document.getElementById('btn-create-piggybank').addEventListener('click', () => {
        document.getElementById('modal-piggybank').style.display = 'flex';
      });
      
       // New Exchange Button
      const exchangeBtn = document.getElementById('btn-exchange');
      if(exchangeBtn) {
          exchangeBtn.addEventListener('click', () => {
             document.getElementById('modal-exchange').style.display = 'flex';
             updateExchangeRate(); // Fetch rate when opening
          });
      }

      document.getElementById('btn-cancel-income').addEventListener('click', () => {
        document.getElementById('modal-income').style.display = 'none';
        document.getElementById('form-income').reset();
      });
      
      document.getElementById('btn-cancel-expense').addEventListener('click', () => {
        document.getElementById('modal-expense').style.display = 'none';
        document.getElementById('form-expense').reset();
      });
      
      document.getElementById('btn-cancel-piggybank').addEventListener('click', () => {
        document.getElementById('modal-piggybank').style.display = 'none';
        document.getElementById('form-piggybank').reset();
      });
      
      document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        document.getElementById('modal-edit').style.display = 'none';
        document.getElementById('form-edit').reset();
        editingTransaction = null;
      });
      
      // New Exchange Cancel
      const cancelExchangeBtn = document.getElementById('btn-cancel-exchange');
      if(cancelExchangeBtn) {
          cancelExchangeBtn.addEventListener('click', () => {
            document.getElementById('modal-exchange').style.display = 'none';
            document.getElementById('form-exchange').reset();
          });
      }

      // Exchange Auto-Calculation Listeners
      const exAmountFrom = document.getElementById('exchange-amount-from');
      const exRate = document.getElementById('exchange-rate');
      const exCurrFrom = document.getElementById('exchange-currency-from');
      const exCurrTo = document.getElementById('exchange-currency-to');

      if(exAmountFrom) exAmountFrom.addEventListener('input', calculateExchange);
      if(exRate) exRate.addEventListener('input', calculateExchange);
      if(exCurrFrom) exCurrFrom.addEventListener('change', updateExchangeRate);
      if(exCurrTo) exCurrTo.addEventListener('change', updateExchangeRate);

      document.getElementById('form-income').addEventListener('submit', handleIncomeSubmit);
      document.getElementById('form-expense').addEventListener('submit', handleExpenseSubmit);
      document.getElementById('form-piggybank').addEventListener('submit', handlePiggybankSubmit);
      document.getElementById('form-edit').addEventListener('submit', handleEditSubmit);
      
      const formExchange = document.getElementById('form-exchange');
      if(formExchange) formExchange.addEventListener('submit', handleExchangeSubmit);
      
      // Close settings
       document.getElementById('btn-close-settings').addEventListener('click', () => {
          document.getElementById('modal-settings').style.display = 'none';
       });
    }

    const currencyMap = {
        '€': 'EUR',
        '$': 'USD',
        '£': 'GBP',
        '¥': 'JPY'
    };

    async function updateExchangeRate() {
        const from = document.getElementById('exchange-currency-from').value;
        const to = document.getElementById('exchange-currency-to').value;
        const rateInput = document.getElementById('exchange-rate');
        
        if (from === to) {
            rateInput.value = 1;
            calculateExchange();
            return;
        }

        const fromCode = currencyMap[from] || 'EUR';
        const toCode = currencyMap[to] || 'USD';

        rateInput.parentElement.classList.add('opacity-50'); // visual feedback
        
        try {
            const response = await fetch(`https://open.er-api.com/v6/latest/${fromCode}`);
            const data = await response.json();
            
            if (data && data.rates && data.rates[toCode]) {
                rateInput.value = data.rates[toCode].toFixed(4);
            } else {
                rateInput.value = 1.0000; // Fallback
            }
        } catch (e) {
            console.error("Error fetching rates", e);
            // Don't change value if fetch fails, user might have entered manually
        } finally {
            rateInput.parentElement.classList.remove('opacity-50');
            calculateExchange();
        }
    }

    function calculateExchange() {
        const amountFrom = parseFloat(document.getElementById('exchange-amount-from').value) || 0;
        const rate = parseFloat(document.getElementById('exchange-rate').value) || 0;
        const amountToInput = document.getElementById('exchange-amount-to');
        
        const result = amountFrom * rate;
        amountToInput.value = result.toFixed(2);
    }
    
    function openEditModal(transaction) {
      editingTransaction = transaction;
      
      const modalTitle = document.getElementById('edit-modal-title');
      const piggybankLabel = document.getElementById('edit-piggybank-label');
      
      if (transaction.type === 'income') {
        modalTitle.textContent = '✏️ Editar Ingreso';
        piggybankLabel.textContent = '¿Destinar a una hucha?';
      } else {
        modalTitle.textContent = '✏️ Editar Gasto';
        piggybankLabel.textContent = '¿Pagar desde una hucha?';
      }
      
      document.getElementById('edit-concept').value = transaction.concept;
      document.getElementById('edit-amount').value = transaction.amount;
      document.getElementById('edit-currency').value = transaction.currency || '€';
      
      const date = new Date(transaction.timestamp);
      const dateStr = date.toISOString().split('T')[0];
      document.getElementById('edit-date').value = dateStr;
      
      updateEditPiggybankSelect();
      document.getElementById('edit-piggybank').value = transaction.piggybank_id || '';
      
      document.getElementById('modal-edit').style.display = 'flex';
    }
    
    function updateEditPiggybankSelect() {
      const editSelect = document.getElementById('edit-piggybank');
      editSelect.innerHTML = '<option value="">Saldo global</option>';
      
      if (editingTransaction) {
        piggybanks.forEach((piggybank, id) => {
          if (editingTransaction.type === 'income') {
            if (!piggybank.completed) {
              editSelect.innerHTML += `<option value="${id}">${piggybank.name} (${piggybank.current.toFixed(2)}/${piggybank.goal.toFixed(2)} ${piggybank.currency})</option>`;
            }
          } else if (editingTransaction.type === 'expense') {
            if (piggybank.current > 0) {
              editSelect.innerHTML += `<option value="${id}">${piggybank.name} (${piggybank.current.toFixed(2)} ${piggybank.currency} disponible)</option>`;
            }
          }
        });
      }
    }
    
    async function handleEditSubmit(e) {
      e.preventDefault();
      
      if (!editingTransaction) return;
      
      const concept = document.getElementById('edit-concept').value;
      const amount = parseFloat(document.getElementById('edit-amount').value);
      const currency = document.getElementById('edit-currency').value;
      const dateValue = document.getElementById('edit-date').value;
      const piggybankId = document.getElementById('edit-piggybank').value;
      
      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Guardando...';
      
      let piggybankName = '';
      let piggybankGoal = 0;
      
      if (piggybankId) {
        const piggybank = piggybanks.get(piggybankId);
        if (piggybank) {
          piggybankName = piggybank.name;
          piggybankGoal = piggybank.goal;
        }
      }
      
      const dateObj = new Date(dateValue + 'T12:00:00');
      
      const updatedTransaction = {
        ...editingTransaction,
        concept,
        amount,
        currency,
        timestamp: dateObj.toISOString(),
        piggybank_id: piggybankId || '',
        piggybank_name: piggybankName,
        piggybank_goal: piggybankGoal,
        edited: true
      };
      
      const result = await apiCall('/api/transaction', 'PUT', updatedTransaction);
      
      submitButton.disabled = false;
      submitButton.textContent = 'Guardar';
      
      if (result && result.success) {
        document.getElementById('modal-edit').style.display = 'none';
        document.getElementById('form-edit').reset();
        editingTransaction = null;
        showToast('Transacción actualizada correctamente', 'success');
        loadData(); // Reload to refresh state
      } else {
        showToast('Error al actualizar la transacción', 'error');
      }
    }
    
    async function handleIncomeSubmit(e) {
      e.preventDefault();
      
      const concept = document.getElementById('income-concept').value;
      const amount = parseFloat(document.getElementById('income-amount').value);
      const currency = document.getElementById('income-currency').value;
      const piggybankId = document.getElementById('income-piggybank').value;
      
      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Añadiendo...';
      
      let piggybankName = '';
      let piggybankGoal = 0;
      
      if (piggybankId) {
        const piggybank = piggybanks.get(piggybankId);
        if (piggybank) {
          piggybankName = piggybank.name;
          piggybankGoal = piggybank.goal;
        }
      }
      
      const result = await apiCall('/api/transaction', 'POST', {
        type: 'income',
        concept,
        amount,
        currency,
        timestamp: new Date().toISOString(),
        piggybank_id: piggybankId || '',
        piggybank_name: piggybankName,
        piggybank_goal: piggybankGoal
      });
      
      submitButton.disabled = false;
      submitButton.textContent = 'Añadir';
      
      if (result && result.success) {
        document.getElementById('modal-income').style.display = 'none';
        document.getElementById('form-income').reset();
        showToast('Ingreso añadido correctamente', 'success');
        loadData();
      } else {
        showToast('Error al añadir el ingreso', 'error');
      }
    }
    
    async function handleExpenseSubmit(e) {
      e.preventDefault();
      
      const concept = document.getElementById('expense-concept').value;
      const amount = parseFloat(document.getElementById('expense-amount').value);
      const currency = document.getElementById('expense-currency').value;
      const piggybankId = document.getElementById('expense-piggybank').value;
      
      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Añadiendo...';
      
      let piggybankName = '';
      let piggybankGoal = 0;
      
      if (piggybankId) {
        const piggybank = piggybanks.get(piggybankId);
        if (piggybank) {
          piggybankName = piggybank.name;
          piggybankGoal = piggybank.goal;
        }
      }
      
      const result = await apiCall('/api/transaction', 'POST', {
        type: 'expense',
        concept,
        amount,
        currency,
        timestamp: new Date().toISOString(),
        piggybank_id: piggybankId || '',
        piggybank_name: piggybankName,
        piggybank_goal: piggybankGoal
      });
      
      submitButton.disabled = false;
      submitButton.textContent = 'Añadir';
      
      if (result && result.success) {
        document.getElementById('modal-expense').style.display = 'none';
        document.getElementById('form-expense').reset();
        showToast('Gasto añadido correctamente', 'success');
        loadData();
      } else {
        showToast('Error al añadir el gasto', 'error');
      }
    }
    
    async function handlePiggybankSubmit(e) {
      e.preventDefault();
      
      const name = document.getElementById('piggybank-name').value;
      const goal = parseFloat(document.getElementById('piggybank-goal').value);
      const currency = document.getElementById('piggybank-currency').value;
      
      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Creando...';
      
      const result = await apiCall('/api/piggybank', 'POST', {
        id: Date.now().toString(), // Helper for backend, though backend can assign ID
        concept: name,
        amount: goal,
        currency,
        timestamp: new Date().toISOString()
      });
      
      submitButton.disabled = false;
      submitButton.textContent = 'Crear';
      
      if (result && result.success) {
        document.getElementById('modal-piggybank').style.display = 'none';
        document.getElementById('form-piggybank').reset();
        showToast('Hucha creada correctamente', 'success');
        loadData();
      } else {
        showToast('Error al crear la hucha', 'error');
      }
    }

    async function handleExchangeSubmit(e) {
      e.preventDefault();
      
      const amountFrom = parseFloat(document.getElementById('exchange-amount-from').value);
      const currencyFrom = document.getElementById('exchange-currency-from').value;
      const amountTo = parseFloat(document.getElementById('exchange-amount-to').value);
      const currencyTo = document.getElementById('exchange-currency-to').value;
      
      if (currencyFrom === currencyTo) {
          showToast('Las divisas deben ser diferentes', 'error');
          return;
      }
      
      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Cambiando...';
      
      const result = await apiCall('/api/exchange', 'POST', {
        amountFrom,
        currencyFrom,
        amountTo,
        currencyTo,
        timestamp: new Date().toISOString()
      });
      
      submitButton.disabled = false;
      submitButton.textContent = 'Cambiar';
      
      if (result && result.success) {
        document.getElementById('modal-exchange').style.display = 'none';
        document.getElementById('form-exchange').reset();
        showToast('Cambio de divisa realizado', 'success');
        loadData();
      } else {
         showToast('Error al realizar el cambio', 'error');
      }
    }
    
    function updateUI() {
      updatePiggybanks();
      updateBalance();
      updateTransactionLists();
      updatePiggybankSelects();
    }
    
    function updateBalance() {
      const euroBalance = { income: 0, expense: 0 };
      const dollarBalance = { income: 0, expense: 0 };
      
      const incomes = transactions.filter(t => t.type === 'income');
      const expenses = transactions.filter(t => t.type === 'expense');
      
      incomes.forEach(income => {
        const currency = income.currency || '€';
        if (income.piggybank_id) {
          const piggybank = piggybanks.get(income.piggybank_id);
          if (piggybank) {
            const piggybankIncomes = incomes.filter(i => i.piggybank_id === income.piggybank_id);
            const piggybankExpenses = expenses.filter(e => e.piggybank_id === income.piggybank_id);
            
            const totalPiggybankIncome = piggybankIncomes.reduce((sum, t) => sum + t.amount, 0);
            const totalPiggybankExpense = piggybankExpenses.reduce((sum, t) => sum + t.amount, 0);
            
            // Logic to check how much actually overflows
            // The logic here is tricky: We need to calculate the state of the piggybank
            // based on ALL transactions.
            // Simplified: If the piggybank is full, any NEW income overflows.
            // But 'overflow' calculation here iterates per transaction.
            // It's better to calculate the TOTAL overflow of the piggybank once and add it to the global balance.
            
          }
        } else {
          // Regular income
          if (currency === '€') {
            euroBalance.income += income.amount;
          } else if (currency === '$') {
            dollarBalance.income += income.amount;
          }
        }
      });
      
      // Calculate Overflow separately
      piggybanks.forEach(pb => {
          if (pb.current > pb.goal) {
              const overflow = pb.current - pb.goal;
              if (pb.currency === '€') euroBalance.income += overflow;
              if (pb.currency === '$') dollarBalance.income += overflow;
          }
      });

      expenses.forEach(expense => {
        if (!expense.piggybank_id) {
          const currency = expense.currency || '€';
          if (currency === '€') {
            euroBalance.expense += expense.amount;
          } else if (currency === '$') {
            dollarBalance.expense += expense.amount;
          }
        }
      });
      
      const euroTotal = euroBalance.income - euroBalance.expense;
      const dollarTotal = dollarBalance.income - dollarBalance.expense;
      
      const euroElement = document.getElementById('balance-euro');
      const euroColor = euroTotal < 0 ? '#ef4444' : '#10b981';
      euroElement.innerHTML = `
        <p class="text-sm text-gray-500 mb-1">Euros</p>
        <p class="text-6xl font-bold transition-all duration-300" style="color: ${euroColor}">${euroTotal.toFixed(2)}<span class="text-4xl">€</span></p>
      `;
      
      const dollarElement = document.getElementById('balance-dollar');
      const dollarColor = dollarTotal < 0 ? '#ef4444' : '#10b981';
      dollarElement.innerHTML = `
        <p class="text-sm text-gray-500 mb-1">Dólares</p>
        <p class="text-6xl font-bold transition-all duration-300" style="color: ${dollarColor}">${dollarTotal.toFixed(2)}<span class="text-4xl">$</span></p>
      `;
    }
    
    function updatePiggybanks() {
        // We re-calculate the status of every piggybank based on transactions
        // Note: piggybanks Map was initialized in loadData() with the definitions
        
        piggybanks.forEach((pb, id) => {
             const incomes = transactions.filter(t => t.type === 'income' && t.piggybank_id === id);
             const expenses = transactions.filter(t => t.type === 'expense' && t.piggybank_id === id);
             
             const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);
             const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
             
             // The "current" value of a piggybank is how much is INSIDE it.
             // If it overflows, the overflow is conceptually "out" of the piggybank into the global balance,
             // BUT for the progress bar, we might want to show it full.
             // However, the logic says "sobra dinero... se va al saldo global".
             // So the piggybank caps at its goal.
             
             let rawCurrent = totalIncome - totalExpense;
             // If rawCurrent > goal, the excess is effectively in the global balance.
             // So the jar contains min(rawCurrent, goal).
             // Wait, if I cap it here, the updateBalance logic needs to know the overflow amount.
             
             // Let's store rawCurrent in the object for calculation
             pb.current = rawCurrent; 
             pb.completed = rawCurrent >= pb.goal;
        });
        
        renderPiggybanks();
    }
    
    function renderPiggybanks() {
      const container = document.getElementById('piggybanks-container');
      const noPiggybanks = document.getElementById('no-piggybanks');
      
      if (piggybanks.size === 0) {
        container.innerHTML = '';
        noPiggybanks.style.display = 'block';
        return;
      }
      
      noPiggybanks.style.display = 'none';
      container.innerHTML = '';
      
      piggybanks.forEach((piggybank, id) => {
        // Display logic: capped at 100% for the visual bar?
        // Or show >100%?
        // "Cuando la hucha esté llena... los 20€ restantes pasarían a añadirse al saldo global"
        // This implies the jar visually stays at 100% (or the specific goal amount).
        
        const displayCurrent = Math.min(piggybank.current, piggybank.goal);
        const percentage = (displayCurrent / piggybank.goal) * 100;
        const isCompleted = piggybank.completed;
        
        const card = document.createElement('div');
        card.className = 'piggybank-card bg-white rounded-2xl shadow-lg p-6 relative overflow-hidden';
        
        card.innerHTML = `
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-xl font-bold text-gray-800">${piggybank.name}</h3>
              <p class="text-sm text-gray-500">Objetivo: ${piggybank.goal.toFixed(2)}${piggybank.currency || '€'}</p>
            </div>
            <button class="delete-piggybank text-red-500 hover:text-red-700 font-bold text-xl" data-id="${id}">×</button>
          </div>
          
          ${isCompleted ? '<div class="absolute top-4 right-4"><span class="text-3xl">✅</span></div>' : ''}
          
          <div class="mb-3">
            <div class="flex justify-between text-sm mb-1">
              <span class="font-semibold text-gray-700">${displayCurrent.toFixed(2)}${piggybank.currency || '€'}</span>
              <span class="text-gray-500">${percentage.toFixed(0)}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div class="progress-bar h-full rounded-full transition-all ${isCompleted ? 'bg-green-500' : 'bg-purple-500'}" style="width: ${Math.min(percentage, 100)}%"></div>
            </div>
          </div>
          
          ${isCompleted ? '<p class="text-green-600 font-semibold text-center">¡Objetivo completado! 🎉</p>' : ''}
        `;
        
        container.appendChild(card);
      });
      
      document.querySelectorAll('.delete-piggybank').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          const piggybank = piggybanks.get(id);
          if (piggybank) {
            if(!confirm('¿Estás seguro? Se eliminará la hucha.')) return;
            
            btn.disabled = true;
            const result = await apiCall('/api/piggybank', 'DELETE', { id: id });
            if (!result || !result.success) {
              showToast('Error al eliminar la hucha', 'error');
              btn.disabled = false;
            } else {
                showToast('Hucha eliminada', 'success');
                loadData();
            }
          }
        });
      });
    }
    
    function updateTransactionLists() {
      const incomeList = document.getElementById('income-list');
      const expenseList = document.getElementById('expense-list');
      const noIncome = document.getElementById('no-income');
      const noExpenses = document.getElementById('no-expenses');
      
      const incomes = transactions.filter(t => t.type === 'income');
      const expenses = transactions.filter(t => t.type === 'expense');
      
      if (incomes.length === 0) {
        incomeList.innerHTML = '';
        noIncome.style.display = 'block';
      } else {
        noIncome.style.display = 'none';
        incomeList.innerHTML = incomes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(income => `
          <div class="transaction-item bg-green-50 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p class="font-semibold text-gray-800">
                ${income.concept}
                ${income.edited ? '<span class="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full ml-2">Editado</span>' : ''}
              </p>
              ${income.piggybank_name ? `<p class="text-xs text-gray-500">→ ${income.piggybank_name}</p>` : ''}
              <p class="text-xs text-gray-500">${new Date(income.timestamp).toLocaleDateString()}</p>
            </div>
            <div class="text-right">
              <p class="font-bold text-green-600 text-lg">+${income.amount.toFixed(2)}${income.currency || '€'}</p>
              <div class="flex gap-2 justify-end mt-1">
                <button class="edit-transaction text-blue-500 hover:text-blue-700 text-sm" data-id="${income.id}">Editar</button>
                <button class="delete-transaction text-red-500 hover:text-red-700 text-sm" data-id="${income.id}">Eliminar</button>
              </div>
            </div>
          </div>
        `).join('');
      }
      
      if (expenses.length === 0) {
        expenseList.innerHTML = '';
        noExpenses.style.display = 'block';
      } else {
        noExpenses.style.display = 'none';
        expenseList.innerHTML = expenses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(expense => `
          <div class="transaction-item bg-red-50 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p class="font-semibold text-gray-800">
                ${expense.concept}
                ${expense.edited ? '<span class="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full ml-2">Editado</span>' : ''}
              </p>
              ${expense.piggybank_name ? `<p class="text-xs text-gray-500">← ${expense.piggybank_name}</p>` : ''}
              <p class="text-xs text-gray-500">${new Date(expense.timestamp).toLocaleDateString()}</p>
            </div>
            <div class="text-right">
              <p class="font-bold text-red-600 text-lg">-${expense.amount.toFixed(2)}${expense.currency || '€'}</p>
              <div class="flex gap-2 justify-end mt-1">
                <button class="edit-transaction text-blue-500 hover:text-blue-700 text-sm" data-id="${expense.id}">Editar</button>
                <button class="delete-transaction text-red-500 hover:text-red-700 text-sm" data-id="${expense.id}">Eliminar</button>
              </div>
            </div>
          </div>
        `).join('');
      }
      
      document.querySelectorAll('.delete-transaction').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          const transaction = transactions.find(t => t.id === id);
          if (transaction) {
            btn.disabled = true;
            btn.textContent = 'Eliminando...';
            const result = await apiCall('/api/transaction', 'DELETE', { id: transaction.id });
            if (!result || !result.success) {
              showToast('Error al eliminar la transacción', 'error');
              btn.disabled = false;
              btn.textContent = 'Eliminar';
            } else {
                showToast('Transacción eliminada', 'success');
                loadData();
            }
          }
        });
      });
      
      document.querySelectorAll('.edit-transaction').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.dataset.id;
          const transaction = transactions.find(t => t.id === id);
          if (transaction) {
            openEditModal(transaction);
          }
        });
      });
    }
    
    function updatePiggybankSelects() {
      const incomeSelect = document.getElementById('income-piggybank');
      const expenseSelect = document.getElementById('expense-piggybank');
      
      incomeSelect.innerHTML = '<option value="">No, al saldo global</option>';
      expenseSelect.innerHTML = '<option value="">No, del saldo global</option>';
      
      piggybanks.forEach((piggybank, id) => {
        if (!piggybank.completed) {
          incomeSelect.innerHTML += `<option value="${id}">${piggybank.name} (${piggybank.current.toFixed(2)}/${piggybank.goal.toFixed(2)} ${piggybank.currency})</option>`;
        }
        
        if (piggybank.current > 0) {
          expenseSelect.innerHTML += `<option value="${id}">${piggybank.name} (${piggybank.current.toFixed(2)} ${piggybank.currency} disponible)</option>`;
        }
      });
    }
    
    function showToast(message, type) {
      const toast = document.createElement('div');
      toast.className = `fixed bottom-8 right-8 px-6 py-4 rounded-xl shadow-2xl text-white font-semibold animate-slide-in z-50 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
      toast.textContent = message;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
    
    // Start
    initApp();
