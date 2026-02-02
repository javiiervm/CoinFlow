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
      // Theme Initialization
      const savedTheme = localStorage.getItem('theme') || 'light';
      setTheme(savedTheme);

      await loadData();
      setupEventListeners();
      
      // Initial UI updates
      updateBalance();
      updateOtherCurrencySelector();
    }
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        const icon = document.getElementById('icon-theme');
        if (icon) {
            icon.textContent = theme === 'dark' ? '🌙' : '🌞';
        }
    }

    function toggleTheme() {
        const current = localStorage.getItem('theme') || 'light';
        setTheme(current === 'light' ? 'dark' : 'light');
    }
    
    async function loadData() {
      const data = await apiCall('/api/data');
      if (data) {
        transactions = data.transactions || [];
        piggybanks.clear();
        (data.piggybanks || []).forEach(pb => {
             piggybanks.set(pb.id, {
                 ...pb,
                 name: pb.concept,
                 goal: pb.amount,
                 current: 0, 
                 completed: false
             });
        });
        updateUI();
      }
    }

    function updateOtherCurrencySelector() {
        // No-op
    }

    // Filter State
    const filters = {
        search: '',
        sortBy: 'date-desc',
        dateStart: null,
        dateEnd: null,
        amountMin: null,
        amountMax: null
    };

    let editingTransaction = null;
    
    function setupEventListeners() {
      // Filters Listeners
      const filterInputs = [
          'filter-search', 'filter-sort', 
          'filter-date-start', 'filter-date-end', 
          'filter-amount-min', 'filter-amount-max'
      ];
      
      filterInputs.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
              el.addEventListener('input', (e) => {
                  const key = id.replace('filter-', '');
                  let value = e.target.value;
                  
                  // Map specific keys if needed, or handle generically
                  if (id === 'filter-search') filters.search = value.toLowerCase();
                  if (id === 'filter-sort') filters.sortBy = value;
                  if (id === 'filter-date-start') filters.dateStart = value ? new Date(value) : null;
                  if (id === 'filter-date-end') filters.dateEnd = value ? new Date(value) : null;
                  if (id === 'filter-amount-min') filters.amountMin = value ? parseFloat(value) : null;
                  if (id === 'filter-amount-max') filters.amountMax = value ? parseFloat(value) : null;
                  
                  // Debounce could be added here if dataset is huge, but for now direct update
                  updateFilteredUI();
              });
          }
      });

      // Reset Filters
      const btnResetFilters = document.getElementById('btn-reset-filters');
      if (btnResetFilters) {
          btnResetFilters.addEventListener('click', () => {
              // Reset DOM elements
              document.getElementById('filter-search').value = '';
              document.getElementById('filter-sort').value = 'date-desc';
              document.getElementById('filter-date-start').value = '';
              document.getElementById('filter-date-end').value = '';
              document.getElementById('filter-amount-min').value = '';
              document.getElementById('filter-amount-max').value = '';

              // Reset State
              filters.search = '';
              filters.sortBy = 'date-desc';
              filters.dateStart = null;
              filters.dateEnd = null;
              filters.amountMin = null;
              filters.amountMax = null;

              updateFilteredUI();
              showToast('Filtros restablecidos', 'success');
          });
      }

      // Theme Toggle
      const btnTheme = document.getElementById('btn-theme-toggle');
      if (btnTheme) {
          btnTheme.addEventListener('click', toggleTheme);
      }

      // Delete All
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
        // Reset state on open
        document.getElementById('expense-create-piggybank').checked = false;
        document.getElementById('expense-new-piggybank-container').classList.add('hidden');
        document.getElementById('expense-piggybank').disabled = false;
        document.getElementById('expense-external').checked = false;
      });

      // New Listener for Expense Piggybank Creation Toggle
      const createPbCheckbox = document.getElementById('expense-create-piggybank');
      if (createPbCheckbox) {
          createPbCheckbox.addEventListener('change', (e) => {
              const container = document.getElementById('expense-new-piggybank-container');
              const select = document.getElementById('expense-piggybank');
              
              if (e.target.checked) {
                  container.classList.remove('hidden');
                  select.disabled = true;
                  select.value = "";
              } else {
                  container.classList.add('hidden');
                  select.disabled = false;
              }
          });
      }
      
      document.getElementById('btn-create-piggybank').addEventListener('click', () => {
        document.getElementById('modal-piggybank').style.display = 'flex';
      });
      
      const exchangeBtn = document.getElementById('btn-exchange');
      if(exchangeBtn) {
          exchangeBtn.addEventListener('click', () => {
             document.getElementById('modal-exchange').style.display = 'flex';
             updateExchangeRate();
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
      
      const cancelExchangeBtn = document.getElementById('btn-cancel-exchange');
      if(cancelExchangeBtn) {
          cancelExchangeBtn.addEventListener('click', () => {
            document.getElementById('modal-exchange').style.display = 'none';
            document.getElementById('form-exchange').reset();
          });
      }
      
      // Edit Piggybank Modal Listeners
      document.getElementById('btn-cancel-piggybank-edit').addEventListener('click', () => {
          document.getElementById('modal-piggybank-edit').style.display = 'none';
          document.getElementById('form-piggybank-edit').reset();
      });

      document.getElementById('form-piggybank-edit').addEventListener('submit', async (e) => {
          e.preventDefault();
          const id = document.getElementById('edit-piggybank-id').value;
          const name = document.getElementById('edit-piggybank-name').value;
          const goal = parseFloat(document.getElementById('edit-piggybank-goal').value);
          
          const result = await apiCall('/api/piggybank', 'PUT', {
              id,
              concept: name,
              amount: goal
          });
          
          if (result && result.success) {
              document.getElementById('modal-piggybank-edit').style.display = 'none';
              showToast('Hucha actualizada', 'success');
              loadData();
          } else {
              showToast('Error al actualizar', 'error');
          }
      });

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

      // Listeners for Piggybank Type Toggle
      document.querySelectorAll('input[name="piggybank-type"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
              const type = e.target.value;
              const savingsFields = document.getElementById('piggybank-savings-fields');
              const budgetFields = document.getElementById('piggybank-budget-fields');
              const goalInput = document.getElementById('piggybank-goal');
              const startAmountInput = document.getElementById('piggybank-start-amount');

              if (type === 'savings') {
                  savingsFields.classList.remove('hidden');
                  budgetFields.classList.add('hidden');
                  goalInput.required = true;
                  startAmountInput.required = false;
              } else {
                  savingsFields.classList.add('hidden');
                  budgetFields.classList.remove('hidden');
                  goalInput.required = false;
                  startAmountInput.required = true;
              }
          });
      });

      // Withdraw Modal Listeners
      const btnCancelWithdraw = document.getElementById('btn-cancel-withdraw');
      if (btnCancelWithdraw) {
          btnCancelWithdraw.addEventListener('click', () => {
              document.getElementById('modal-withdraw').style.display = 'none';
              document.getElementById('form-withdraw').reset();
          });
      }
      const formWithdraw = document.getElementById('form-withdraw');
      if (formWithdraw) {
          formWithdraw.addEventListener('submit', handleWithdrawSubmit);
      }
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

        rateInput.parentElement.classList.add('opacity-50');
        
        try {
            const response = await fetch(`https://open.er-api.com/v6/latest/${fromCode}`);
            const data = await response.json();
            
            if (data && data.rates && data.rates[toCode]) {
                rateInput.value = data.rates[toCode].toFixed(4);
            } else {
                rateInput.value = 1.0000;
            }
        } catch (e) {
            console.error("Error fetching rates", e);
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
      const externalContainer = document.getElementById('edit-external-container');
      const externalCheckbox = document.getElementById('edit-external');
      
      if (transaction.type === 'income') {
        modalTitle.textContent = '✏️ Editar Ingreso';
        piggybankLabel.textContent = '¿Destinar a una hucha?';
        externalContainer.classList.add('hidden');
        externalCheckbox.checked = false;
      } else {
        modalTitle.textContent = '✏️ Editar Gasto';
        piggybankLabel.textContent = '¿Pagar desde una hucha?';
        externalContainer.classList.remove('hidden');
        externalCheckbox.checked = !!transaction.external;
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
      const isExternal = document.getElementById('edit-external').checked;
      
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
        external: isExternal,
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
        loadData();
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
      const isExternal = document.getElementById('expense-external').checked;
      
      const createNew = document.getElementById('expense-create-piggybank').checked;
      let piggybankId = document.getElementById('expense-piggybank').value;
      const newPiggybankName = document.getElementById('expense-new-piggybank-name').value;
      
      if (createNew && !newPiggybankName.trim()) {
          showToast('Debes indicar un nombre para la nueva hucha', 'error');
          return;
      }

      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Añadiendo...';
      
      let piggybankName = '';
      let piggybankGoal = 0;
      
      // If NOT creating new, look up existing info
      if (!createNew && piggybankId) {
        const piggybank = piggybanks.get(piggybankId);
        if (piggybank) {
          piggybankName = piggybank.name;
          piggybankGoal = piggybank.goal;
        }
      }
      
      const payload = {
        type: 'expense',
        concept,
        amount,
        currency,
        external: isExternal,
        timestamp: new Date().toISOString(),
        piggybank_id: piggybankId || '',
        piggybank_name: piggybankName,
        piggybank_goal: piggybankGoal
      };

      if (createNew) {
          payload.create_piggybank = true;
          payload.new_piggybank_name = newPiggybankName;
          // piggybank_id will be ignored/overwritten by backend
      }
      
      const result = await apiCall('/api/transaction', 'POST', payload);
      
      submitButton.disabled = false;
      submitButton.textContent = 'Añadir';
      
      if (result && result.success) {
        document.getElementById('modal-expense').style.display = 'none';
        document.getElementById('form-expense').reset();
        
        // Reset specific UI states
        document.getElementById('expense-create-piggybank').checked = false;
        document.getElementById('expense-external').checked = false;
        document.getElementById('expense-new-piggybank-container').classList.add('hidden');
        document.getElementById('expense-piggybank').disabled = false;
        
        showToast('Gasto añadido correctamente', 'success');
        loadData();
      } else {
        showToast('Error al añadir el gasto', 'error');
      }
    }
    
    async function handlePiggybankSubmit(e) {
      e.preventDefault();
      
      const name = document.getElementById('piggybank-name').value;
      const currency = document.getElementById('piggybank-currency').value;
      const type = document.querySelector('input[name="piggybank-type"]:checked').value;
      
      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Creando...';
      
      let goal = 0;
      let initialAmount = 0;
      let source = '';

      if (type === 'savings') {
          goal = parseFloat(document.getElementById('piggybank-goal').value);
      } else {
          initialAmount = parseFloat(document.getElementById('piggybank-start-amount').value);
          source = document.getElementById('piggybank-source').value;
          goal = initialAmount; // Logical goal for display or irrelevant
      }
      
      const pbId = Date.now().toString();
      
      // Create Piggybank Definition
      const result = await apiCall('/api/piggybank', 'POST', {
        id: pbId,
        concept: name,
        amount: goal,
        currency,
        type: type, // 'savings' or 'budget'
        timestamp: new Date().toISOString()
      });
      
      if (result && result.success) {
          // If Budget type, create initial transactions
          if (type === 'budget') {
              const timestamp = new Date().toISOString();
              
              // 1. Initial Deposit to Piggybank
              await apiCall('/api/transaction', 'POST', {
                  type: 'income',
                  concept: 'Saldo Inicial',
                  amount: initialAmount,
                  currency: currency,
                  timestamp: timestamp,
                  piggybank_id: pbId,
                  piggybank_name: name,
                  piggybank_goal: goal
              });
              
              // 2. If sourced from balance, deduct from Global
              if (source === 'balance') {
                   await apiCall('/api/transaction', 'POST', {
                      type: 'expense',
                      concept: `Asignación a presupuesto: ${name}`,
                      amount: initialAmount,
                      currency: currency,
                      timestamp: timestamp,
                      piggybank_id: '', // Global
                  });
              }
          }

        document.getElementById('modal-piggybank').style.display = 'none';
        document.getElementById('form-piggybank').reset();
        // Reset visibility to default
        document.getElementById('piggybank-savings-fields').classList.remove('hidden');
        document.getElementById('piggybank-budget-fields').classList.add('hidden');
        document.querySelector('input[name="piggybank-type"][value="savings"]').checked = true;
        
        showToast('Hucha creada correctamente', 'success');
        loadData();
      } else {
        showToast('Error al crear la hucha', 'error');
      }
      
      submitButton.disabled = false;
      submitButton.textContent = 'Crear';
    }

    async function handleWithdrawSubmit(e) {
        e.preventDefault();
        const pbId = document.getElementById('withdraw-piggybank-id').value;
        const amount = parseFloat(document.getElementById('withdraw-amount').value);
        const pb = piggybanks.get(pbId);
        
        if (!pb) return;
        
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        
        const timestamp = new Date().toISOString();
        
        // 1. Expense from Piggybank (Reduce PB balance)
        const res1 = await apiCall('/api/transaction', 'POST', {
             type: 'expense',
             concept: 'Retirada de fondos',
             amount: amount,
             currency: pb.currency,
             timestamp: timestamp,
             piggybank_id: pbId,
             piggybank_name: pb.name,
             piggybank_goal: pb.goal
        });
        
        // 2. Income to Global (Increase Global balance)
        const res2 = await apiCall('/api/transaction', 'POST', {
             type: 'income',
             concept: `Reintegro desde ${pb.name}`,
             amount: amount,
             currency: pb.currency,
             timestamp: timestamp,
             piggybank_id: ''
        });
        
        if (res1.success && res2.success) {
            document.getElementById('modal-withdraw').style.display = 'none';
            document.getElementById('form-withdraw').reset();
            showToast('Fondos retirados correctamente', 'success');
            loadData();
        } else {
            showToast('Error al retirar fondos', 'error');
        }
        btn.disabled = false;
    }

    // ... (renderPiggybanks update below) ...


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
      updateBalance(); // Balance usually shows TOTAL regardless of filters, or should it filter too? 
                       // Usually dashboard balances are "Current State", not "Filtered View". 
                       // I will keep Balance global for now as per standard dashboard UX.
      updateTransactionLists();
      updatePiggybankSelects();
    }

    function updateFilteredUI() {
        renderPiggybanks();
        updateTransactionLists();
    }

    function applyFiltersAndSort(items, type) {
        let result = [...items];
        
        // 1. Search (Name/Concept)
        if (filters.search) {
            result = result.filter(item => {
                const text = type === 'piggybank' ? item.name : item.concept;
                return text.toLowerCase().includes(filters.search);
            });
        }

        // 2. Date Range
        if (filters.dateStart || filters.dateEnd) {
            result = result.filter(item => {
                const date = new Date(item.timestamp);
                // Reset time for accurate comparison
                date.setHours(0,0,0,0);
                
                let valid = true;
                if (filters.dateStart) {
                     const start = new Date(filters.dateStart);
                     start.setHours(0,0,0,0);
                     if (date < start) valid = false;
                }
                if (filters.dateEnd) {
                     const end = new Date(filters.dateEnd);
                     end.setHours(23,59,59,999); // End of day
                     if (date > end) valid = false;
                }
                return valid;
            });
        }

        // 3. Amount Range
        if (filters.amountMin !== null || filters.amountMax !== null) {
            result = result.filter(item => {
                // For piggybanks, filter by GOAL (or current? Goal is more static)
                const amount = type === 'piggybank' ? item.goal : item.amount;
                
                let valid = true;
                if (filters.amountMin !== null && amount < filters.amountMin) valid = false;
                if (filters.amountMax !== null && amount > filters.amountMax) valid = false;
                return valid;
            });
        }

        // 4. Sort
        result.sort((a, b) => {
            if (filters.sortBy.startsWith('date')) {
                const dateA = new Date(a.timestamp);
                const dateB = new Date(b.timestamp);
                return filters.sortBy === 'date-desc' ? dateB - dateA : dateA - dateB;
            } else if (filters.sortBy.startsWith('amount')) {
                const amountA = type === 'piggybank' ? a.goal : a.amount;
                const amountB = type === 'piggybank' ? b.goal : b.amount;
                return filters.sortBy === 'amount-desc' ? amountB - amountA : amountA - amountB;
            }
            return 0;
        });

        return result;
    }
    
    function updateBalance() {
      const euroBalance = { income: 0, expense: 0 };
      const dollarBalance = { income: 0, expense: 0 };
      
      const incomes = transactions.filter(t => t.type === 'income');
      const expenses = transactions.filter(t => t.type === 'expense' && !t.external);
      
      incomes.forEach(income => {
        const currency = income.currency || '€';
        if (income.piggybank_id) {
            // piggybank logic handled in overflow check
        } else {
          if (currency === '€') {
            euroBalance.income += income.amount;
          } else if (currency === '$') {
            dollarBalance.income += income.amount;
          }
        }
      });
      
      piggybanks.forEach((pb, id) => {
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
      const euroColor = euroTotal < 0 ? 'var(--color-expense)' : 'var(--color-income)';
      euroElement.innerHTML = `
        <p class="text-sm theme-text-secondary mb-1">Euros</p>
        <p class="text-6xl font-bold transition-all duration-300" style="color: ${euroColor}">${euroTotal.toFixed(2)}<span class="text-4xl">€</span></p>
      `;
      
      const dollarElement = document.getElementById('balance-dollar');
      const dollarColor = dollarTotal < 0 ? 'var(--color-expense)' : 'var(--color-income)';
      dollarElement.innerHTML = `
        <p class="text-sm theme-text-secondary mb-1">Dólares</p>
        <p class="text-6xl font-bold transition-all duration-300" style="color: ${dollarColor}">${dollarTotal.toFixed(2)}<span class="text-4xl">$</span></p>
      `;
    }
    
    function updatePiggybanks() {
        piggybanks.forEach((pb, id) => {
             const incomes = transactions.filter(t => t.type === 'income' && t.piggybank_id === id);
             const expenses = transactions.filter(t => t.type === 'expense' && t.piggybank_id === id);
             
             const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);
             const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
             
             let rawCurrent = totalIncome - totalExpense;
             pb.current = rawCurrent; 
             pb.spent = totalExpense;
             pb.totalIncome = totalIncome;
             
             if (pb.created_from_expense) {
                 pb.completed = false; 
             } else if (pb.type === 'budget') {
                 pb.completed = rawCurrent <= 0.01;
             } else {
                 pb.completed = rawCurrent >= pb.goal;
             }
        });
        
        renderPiggybanks();
    }
    
    function renderPiggybanks() {
      const container = document.getElementById('piggybanks-container');
      const noPiggybanks = document.getElementById('no-piggybanks');
      
      const allPiggybanks = Array.from(piggybanks.values());
      const filteredPiggybanks = applyFiltersAndSort(allPiggybanks, 'piggybank');

      if (filteredPiggybanks.length === 0) {
        container.innerHTML = '';
        if (piggybanks.size > 0) {
             noPiggybanks.innerHTML = '<p class="text-xl">No se encontraron huchas con estos filtros.</p>';
             noPiggybanks.style.display = 'block';
        } else {
             noPiggybanks.innerHTML = '<p class="text-xl">No tienes huchas creadas. ¡Crea una para empezar a ahorrar!</p>';
             noPiggybanks.style.display = 'block';
        }
        return;
      }
      
      noPiggybanks.style.display = 'none';
      container.innerHTML = '';
      
      filteredPiggybanks.forEach((piggybank) => {
        const id = piggybank.id;
        const isExpenseTracker = piggybank.created_from_expense;
        const isBudget = piggybank.type === 'budget';
        
        let displayCurrent = Math.min(piggybank.current, piggybank.goal);
        let percentage = (displayCurrent / piggybank.goal) * 100;
        let isCompleted = piggybank.completed;
        let subText = `Objetivo: ${piggybank.goal.toFixed(2)}${piggybank.currency || '€'}`;
        let mainValue = `${displayCurrent.toFixed(2)}${piggybank.currency || '€'}`;
        let barColor = isCompleted ? 'var(--color-income)' : 'var(--bg-header)';
        let badge = '';

        if (isExpenseTracker) {
            displayCurrent = piggybank.spent;
            percentage = 100;
            isCompleted = false;
            subText = `Total Acumulado`;
            mainValue = `${piggybank.goal.toFixed(2)}${piggybank.currency || '€'}`;
            barColor = 'var(--color-expense)';
            badge = '<span class="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-0.5 rounded-full ml-2">Gasto</span>';
        } else if (isBudget) {
            displayCurrent = piggybank.current;
            const baseline = piggybank.totalIncome > 0 ? piggybank.totalIncome : 1;
            percentage = Math.max(0, (displayCurrent / baseline) * 100);
            
            subText = `Disponible`;
            mainValue = `${displayCurrent.toFixed(2)}${piggybank.currency || '€'}`;
            badge = '<span class="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-full ml-2">Presupuesto</span>';
            
            if (displayCurrent < 0) {
                mainValue = `<span class="text-red-500">${displayCurrent.toFixed(2)}${piggybank.currency || '€'}</span>`;
                subText = `<span class="text-red-500 font-bold">¡En números rojos!</span>`;
                barColor = 'red';
                percentage = 100;
            } else {
                barColor = 'var(--color-income)';
            }
        }
        
        const card = document.createElement('div');
        card.className = 'piggybank-card theme-bg-secondary rounded-2xl shadow-lg p-6 relative overflow-hidden theme-border border transition-colors duration-300';
        
        let footerActions = '';
        
        if (isCompleted && !isBudget && !isExpenseTracker) {
             footerActions = `
                <div class="mt-4 text-center">
                    <p class="theme-text-income font-semibold mb-2">¡Objetivo completado! 🎉</p>
                    <button class="btn-spend-piggybank w-full py-2 px-4 rounded-xl theme-btn-expense font-semibold text-sm shadow-md transition-transform hover:scale-105" data-id="${id}">
                   💸 Gastar hucha
                </button>
            </div>`;
        } else if (isBudget) {
             footerActions = `
                <div class="mt-4 flex gap-2">
                    <button class="btn-refill-piggybank flex-1 py-2 px-2 rounded-xl theme-btn-income font-semibold text-sm shadow-md transition-transform hover:scale-105" data-id="${id}">
                       📥 Rellenar
                    </button>
                    ${piggybank.current > 0 ? `
                    <button class="btn-withdraw-piggybank flex-1 py-2 px-2 rounded-xl theme-btn-primary font-semibold text-sm shadow-md transition-transform hover:scale-105" data-id="${id}">
                       📤 Retirar
                    </button>` : ''}
                </div>`;
        }
        
        card.innerHTML = `
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1 mr-2">
              <h3 class="text-xl font-bold theme-text-primary truncate" title="${piggybank.name}">
                ${piggybank.name} 
                ${badge}
              </h3>
              <p class="text-sm theme-text-secondary">${subText}</p>
            </div>
            <div class="flex gap-2 shrink-0">
                 <button class="edit-piggybank theme-text-secondary hover:text-blue-500 transition-colors" data-id="${id}" title="Editar">✏️</button>
                 <button class="delete-piggybank theme-text-expense hover:opacity-75 font-bold text-xl leading-none" data-id="${id}" title="Eliminar">×</button>
            </div>
          </div>
          
          <div class="mb-3">
            <div class="flex justify-between text-sm mb-1">
              <span class="font-semibold theme-text-primary">${mainValue}</span>
              ${!isExpenseTracker ? `<span class="theme-text-secondary">${percentage.toFixed(0)}%</span>` : ''}
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div class="progress-bar h-full rounded-full transition-all" style="width: ${Math.min(percentage, 100)}%; background-color: ${barColor}"></div>
            </div>
          </div>
          
          ${footerActions}
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

      document.querySelectorAll('.edit-piggybank').forEach(btn => {
        btn.addEventListener('click', (e) => {
             const id = e.target.dataset.id;
             const pb = piggybanks.get(id);
             if (pb) {
                 document.getElementById('edit-piggybank-id').value = id;
                 document.getElementById('edit-piggybank-name').value = pb.name;
                 document.getElementById('edit-piggybank-goal').value = pb.goal;
                 document.getElementById('modal-piggybank-edit').style.display = 'flex';
             }
        });
      });

      document.querySelectorAll('.btn-spend-piggybank').forEach(btn => {
          btn.addEventListener('click', async (e) => {
              const id = e.target.dataset.id;
              const pb = piggybanks.get(id);
              if (pb && confirm(`¿Quieres registrar el gasto de la hucha "${pb.name}"? Se creará un gasto por valor de ${pb.goal}${pb.currency}.`)) {
                  // Create expense linked to this piggybank
                  const result = await apiCall('/api/transaction', 'POST', {
                      type: 'expense',
                      concept: pb.name,
                      amount: pb.goal,
                      currency: pb.currency,
                      timestamp: new Date().toISOString(),
                      piggybank_id: id,
                      piggybank_name: pb.name,
                      piggybank_goal: pb.goal
                  });
                  
                  if (result && result.success) {
                      // Delete the piggybank after spending
                      await apiCall('/api/piggybank', 'DELETE', { id: id });
                      showToast('Hucha gastada y finalizada', 'success');
                      loadData();
                  } else {
                      showToast('Error al registrar el gasto', 'error');
                  }
              }
          });
      });

      // Budget Specific Listeners
      document.querySelectorAll('.btn-withdraw-piggybank').forEach(btn => {
          btn.addEventListener('click', (e) => {
               const id = e.target.dataset.id;
               document.getElementById('withdraw-piggybank-id').value = id;
               document.getElementById('modal-withdraw').style.display = 'flex';
          });
      });

      document.querySelectorAll('.btn-refill-piggybank').forEach(btn => {
          btn.addEventListener('click', (e) => {
               const id = e.target.dataset.id;
               document.getElementById('income-piggybank').value = id;
               document.getElementById('modal-income').style.display = 'flex';
               document.getElementById('income-concept').value = "Relleno de presupuesto";
          });
      });
    }
    
    function updateTransactionLists() {
      const incomeList = document.getElementById('income-list');
      const expenseList = document.getElementById('expense-list');
      const noIncome = document.getElementById('no-income');
      const noExpenses = document.getElementById('no-expenses');
      
      const allIncomes = transactions.filter(t => t.type === 'income');
      const allExpenses = transactions.filter(t => t.type === 'expense');
      
      const filteredIncomes = applyFiltersAndSort(allIncomes, 'transaction');
      const filteredExpenses = applyFiltersAndSort(allExpenses, 'transaction');
      
      if (filteredIncomes.length === 0) {
        incomeList.innerHTML = '';
        if (allIncomes.length > 0) {
            noIncome.innerHTML = '<p>No hay ingresos que coincidan.</p>';
        } else {
            noIncome.innerHTML = '<p>No hay ingresos registrados</p>';
        }
        noIncome.style.display = 'block';
      } else {
        noIncome.style.display = 'none';
        incomeList.innerHTML = filteredIncomes.map(income => `
          <div class="transaction-item theme-bg-secondary border-l-4 rounded-xl p-4 flex justify-between items-center mb-3 theme-border border shadow-sm" style="border-left-color: var(--color-income);">
            <div>
              <p class="font-semibold theme-text-primary">
                ${income.concept}
                ${income.edited ? '<span class="text-xs theme-btn-primary text-white px-2 py-0.5 rounded-full ml-2">Editado</span>' : ''}
              </p>
              ${income.piggybank_name ? `<p class="text-xs theme-text-secondary">→ ${income.piggybank_name}</p>` : ''}
              <p class="text-xs theme-text-secondary">${new Date(income.timestamp).toLocaleDateString()}</p>
            </div>
            <div class="text-right">
              <p class="font-bold theme-text-income text-lg">+${income.amount.toFixed(2)}${income.currency || '€'}</p>
              <div class="flex gap-2 justify-end mt-1">
                <button class="edit-transaction theme-text-secondary hover:text-blue-500 text-sm" data-id="${income.id}">Editar</button>
                <button class="delete-transaction theme-text-secondary hover:text-red-500 text-sm" data-id="${income.id}">Eliminar</button>
              </div>
            </div>
          </div>
        `).join('');
      }
      
      if (filteredExpenses.length === 0) {
        expenseList.innerHTML = '';
        if (allExpenses.length > 0) {
            noExpenses.innerHTML = '<p>No hay gastos que coincidan.</p>';
        } else {
            noExpenses.innerHTML = '<p>No hay gastos registrados</p>';
        }
        noExpenses.style.display = 'block';
      } else {
        noExpenses.style.display = 'none';
        expenseList.innerHTML = filteredExpenses.map(expense => `
          <div class="transaction-item theme-bg-secondary border-l-4 rounded-xl p-4 flex justify-between items-center mb-3 theme-border border shadow-sm" style="border-left-color: ${expense.external ? 'gray' : 'var(--color-expense)'};">
            <div>
              <p class="font-semibold theme-text-primary">
                ${expense.concept}
                ${expense.edited ? '<span class="text-xs theme-btn-primary text-white px-2 py-0.5 rounded-full ml-2">Editado</span>' : ''}
                ${expense.external ? '<span class="text-xs bg-gray-500 text-white px-2 py-0.5 rounded-full ml-2">Externo</span>' : ''}
              </p>
              ${expense.piggybank_name ? `<p class="text-xs theme-text-secondary">← ${expense.piggybank_name}</p>` : ''}
              <p class="text-xs theme-text-secondary">${new Date(expense.timestamp).toLocaleDateString()}</p>
            </div>
            <div class="text-right">
              <p class="font-bold text-lg" style="color: ${expense.external ? 'var(--text-secondary)' : 'var(--color-expense)'}">-${expense.amount.toFixed(2)}${expense.currency || '€'}</p>
              <div class="flex gap-2 justify-end mt-1">
                <button class="edit-transaction theme-text-secondary hover:text-blue-500 text-sm" data-id="${expense.id}">Editar</button>
                <button class="delete-transaction theme-text-secondary hover:text-red-500 text-sm" data-id="${expense.id}">Eliminar</button>
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
      
      // Preserve selection if possible? No, usually resets on open.
      const currentIncomeVal = incomeSelect.value;
      const currentExpenseVal = expenseSelect.value;

      incomeSelect.innerHTML = '<option value="">No, al saldo global</option>';
      expenseSelect.innerHTML = '<option value="">No, gasto general</option>';
      
      piggybanks.forEach((piggybank, id) => {
        if (!piggybank.completed) {
          incomeSelect.innerHTML += `<option value="${id}">${piggybank.name} (${piggybank.current.toFixed(2)}/${piggybank.goal.toFixed(2)} ${piggybank.currency})</option>`;
        }
        
        // Show in expense select if it has funds OR if it's an expense tracker
        if (piggybank.current > 0 || piggybank.created_from_expense) {
            let label = `${piggybank.name}`;
            if (piggybank.created_from_expense) {
                label += ` (Acumulado: ${piggybank.goal.toFixed(2)} ${piggybank.currency})`;
            } else {
                label += ` (${piggybank.current.toFixed(2)} ${piggybank.currency} disponible)`;
            }
            expenseSelect.innerHTML += `<option value="${id}">${label}</option>`;
        }
      });
      
      // Restore if valid (though usually this function is called before modal open so it resets)
    }
    
    function showToast(message, type) {
      const toast = document.createElement('div');
      // Toast colors are functional, keep green/red or use variables?
      // "Estados financieros: Verde/Rojo". Notifications fit this.
      const bgClass = type === 'success' ? 'theme-btn-income' : 'theme-btn-expense';
      toast.className = `fixed bottom-8 right-8 px-6 py-4 rounded-xl shadow-2xl text-white font-semibold animate-slide-in z-50 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
      toast.style.backgroundColor = type === 'success' ? 'var(--color-income)' : 'var(--color-expense)';
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