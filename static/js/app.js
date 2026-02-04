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
        
        const sunIcon = document.getElementById('icon-theme-sun');
        const moonIcon = document.getElementById('icon-theme-moon');
        
        if (sunIcon && moonIcon) {
            if (theme === 'dark') {
                sunIcon.classList.remove('hidden');
                moonIcon.classList.add('hidden');
            } else {
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
            }
        }
    }

    function toggleTheme() {
        const current = localStorage.getItem('theme') || 'light';
        setTheme(current === 'light' ? 'dark' : 'light');
    }
    
    async function loadData() {
      const data = await apiCall('/api/data?t=' + Date.now());
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
        // Reset state on open
        document.getElementById('income-piggybank').disabled = false;
        document.getElementById('income-external').checked = false;
        const incomePbSelect = document.getElementById('income-piggybank');
        incomePbSelect.parentElement.classList.remove('opacity-50', 'pointer-events-none');
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

      // External Toggle Listeners
      const expenseExternal = document.getElementById('expense-external');
      if (expenseExternal) {
          expenseExternal.addEventListener('change', (e) => {
              const pbSelect = document.getElementById('expense-piggybank');
              const createPbCheck = document.getElementById('expense-create-piggybank');
              const newPbContainer = document.getElementById('expense-new-piggybank-container');
              
              if (e.target.checked) {
                  // Hide and Reset Piggybank options
                  pbSelect.disabled = true;
                  pbSelect.value = "";
                  pbSelect.parentElement.classList.add('opacity-50', 'pointer-events-none'); // Visual disable
                  
                  createPbCheck.checked = false;
                  createPbCheck.disabled = true;
                  createPbCheck.parentElement.classList.add('opacity-50', 'pointer-events-none');
                  
                  newPbContainer.classList.add('hidden');
              } else {
                  // Restore
                  pbSelect.disabled = false;
                  pbSelect.parentElement.classList.remove('opacity-50', 'pointer-events-none');
                  
                  createPbCheck.disabled = false;
                  createPbCheck.parentElement.classList.remove('opacity-50', 'pointer-events-none');
              }
          });
      }

      // Income External Listener
      const incomeExternal = document.getElementById('income-external');
      if (incomeExternal) {
          incomeExternal.addEventListener('change', (e) => {
              const pbSelect = document.getElementById('income-piggybank');
              
              if (e.target.checked) {
                  pbSelect.disabled = true;
                  pbSelect.value = "";
                  pbSelect.parentElement.classList.add('opacity-50', 'pointer-events-none');
              } else {
                  pbSelect.disabled = false;
                  pbSelect.parentElement.classList.remove('opacity-50', 'pointer-events-none');
              }
          });
      }

      const editExternal = document.getElementById('edit-external');
      if (editExternal) {
          editExternal.addEventListener('change', (e) => {
               const pbSelect = document.getElementById('edit-piggybank');
               const label = document.getElementById('edit-piggybank-label');
               
               if (e.target.checked) {
                   pbSelect.value = "";
                   pbSelect.disabled = true;
                   pbSelect.parentElement.classList.add('hidden');
                   label.parentElement.classList.add('hidden');
               } else {
                   pbSelect.disabled = false;
                   pbSelect.parentElement.classList.remove('hidden');
                   label.parentElement.classList.remove('hidden');
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
          
          if (goal < 0) {
              showToast('El objetivo no puede ser negativo', 'error');
              return;
          }

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

      // Refill Modal Listeners
      const btnCancelRefill = document.getElementById('btn-cancel-refill');
      if (btnCancelRefill) {
          btnCancelRefill.addEventListener('click', () => {
              document.getElementById('modal-refill').style.display = 'none';
              document.getElementById('form-refill').reset();
          });
      }
      const formRefill = document.getElementById('form-refill');
      if (formRefill) {
          formRefill.addEventListener('submit', handleRefillSubmit);
      }

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
      const piggybankContainer = document.getElementById('edit-piggybank').parentElement; // Select container
      const externalContainer = document.getElementById('edit-external-container');
      const externalCheckbox = document.getElementById('edit-external');
      const editPiggybankSelect = document.getElementById('edit-piggybank');
      
      updateEditPiggybankSelect(); // Populate first
      document.getElementById('edit-piggybank').value = transaction.piggybank_id || '';

      if (transaction.type === 'income') {
        modalTitle.textContent = '✏️ Editar Ingreso';
        piggybankLabel.textContent = '¿Destinar a una hucha?';
      } else {
        modalTitle.textContent = '✏️ Editar Gasto';
        piggybankLabel.textContent = '¿Pagar desde una hucha?';
      }
      
      // Shared logic for External/Piggybank visibility
      externalContainer.classList.remove('hidden');
      externalCheckbox.checked = !!transaction.external;
      
      if (transaction.external) {
           piggybankContainer.classList.add('hidden');
           editPiggybankSelect.disabled = true;
           editPiggybankSelect.value = "";
      } else {
           piggybankContainer.classList.remove('hidden');
           editPiggybankSelect.disabled = false;
      }
      
      document.getElementById('edit-concept').value = transaction.concept;
      document.getElementById('edit-amount').value = transaction.amount;
      document.getElementById('edit-currency').value = transaction.currency || '€';
      
      const date = new Date(transaction.timestamp);
      const dateStr = date.toISOString().split('T')[0];
      document.getElementById('edit-date').value = dateStr;
      
      document.getElementById('modal-edit').style.display = 'flex';
    }
    
    function updateEditPiggybankSelect() {
      const editSelect = document.getElementById('edit-piggybank');
      editSelect.innerHTML = '<option value="">Saldo global</option>';
      
      if (editingTransaction) {
        piggybanks.forEach((piggybank, id) => {
          if (editingTransaction.type === 'income') {
            if (!piggybank.completed) {
                let label = `${piggybank.name}`;
                if (piggybank.type === 'budget') {
                    label += ` (Disponible: ${piggybank.current.toFixed(2)} ${piggybank.currency})`;
                } else {
                    label += ` (${piggybank.current.toFixed(2)}/${piggybank.goal.toFixed(2)} ${piggybank.currency})`;
                }
              editSelect.innerHTML += `<option value="${id}">${label}</option>`;
            }
          } else if (editingTransaction.type === 'expense') {
            if (piggybank.current > 0 || piggybank.type === 'budget') {
              editSelect.innerHTML += `<option value="${id}">${piggybank.name} (Disponible: ${piggybank.current.toFixed(2)} ${piggybank.currency})</option>`;
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

      if (amount < 0) {
          showToast('La cantidad no puede ser negativa', 'error');
          return;
      }

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

      if (amount < 0) {
          showToast('La cantidad no puede ser negativa', 'error');
          return;
      }

      const currency = document.getElementById('income-currency').value;
      const piggybankId = document.getElementById('income-piggybank').value;
      const isExternal = document.getElementById('income-external').checked;
      
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
        external: isExternal,
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
        document.getElementById('income-external').checked = false; // Reset checkbox
        const incomePbSelect = document.getElementById('income-piggybank');
        incomePbSelect.disabled = false; // Reset select
        incomePbSelect.parentElement.classList.remove('opacity-50', 'pointer-events-none');
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

      if (amount < 0) {
          showToast('La cantidad no puede ser negativa', 'error');
          return;
      }

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
          initialAmount = parseFloat(document.getElementById('piggybank-start-amount').value) || 0;
          source = document.getElementById('piggybank-source').value;
          goal = 0; // Budget doesn't have a goal
      }

      if (goal < 0 || initialAmount < 0) {
          showToast('La cantidad no puede ser negativa', 'error');
          return;
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
          if (type === 'budget' && initialAmount > 0) {
              const timestamp = new Date().toISOString();
              
              // 1. Initial Deposit to Piggybank
              await apiCall('/api/transaction', 'POST', {
                  type: 'income',
                  concept: 'Saldo Inicial',
                  amount: initialAmount,
                  currency: currency,
                  external: source === 'new',
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

    async function handleRefillSubmit(e) {
        e.preventDefault();
        const pbId = document.getElementById('refill-piggybank-id').value;
        const amount = parseFloat(document.getElementById('refill-amount').value);

        if (amount < 0) {
            showToast('La cantidad no puede ser negativa', 'error');
            return;
        }

        const source = document.getElementById('refill-source').value;
        
        const pb = piggybanks.get(pbId);
        if (!pb) return;
        
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Procesando...';
        
        const timestamp = new Date().toISOString();

        let res1 = { success: true };
        // 1. Expense from Global (Reduction) ONLY if source is 'balance'
        if (source === 'balance') {
            res1 = await apiCall('/api/transaction', 'POST', {
                type: 'expense',
                concept: `Asignación a presupuesto: ${pb.name}`,
                amount: amount,
                currency: pb.currency,
                timestamp: timestamp,
                piggybank_id: '' // Global
            });
        }
        
        let concept = '';
        if (pb.type === 'budget') {
            concept = source === 'new' ? `Recarga externa de presupuesto` : `Recarga de presupuesto`;
        } else if (pb.created_from_expense) {
            concept = source === 'new' ? `Aportación externa a: ${pb.name}` : `Aportación a: ${pb.name}`;
        } else {
            // Savings
            concept = source === 'new' ? `Ahorro externo para: ${pb.name}` : `Ahorro para: ${pb.name}`;
        }

        // 2. Income to Piggybank (Addition)
        const res2 = await apiCall('/api/transaction', 'POST', {
            type: 'income',
            concept: concept,
            amount: amount,
            currency: pb.currency,
            external: source === 'new',
            timestamp: timestamp,
            piggybank_id: pbId,
            piggybank_name: pb.name,
            piggybank_goal: pb.goal
        });
        
        if (res1.success && res2.success) {
            document.getElementById('modal-refill').style.display = 'none';
            document.getElementById('form-refill').reset();
            showToast('Presupuesto rellenado correctamente', 'success');
            loadData();
        } else {
            showToast('Error al rellenar el presupuesto', 'error');
        }
        btn.disabled = false;
        btn.textContent = 'Rellenar';
    }

    async function handleWithdrawSubmit(e) {
        e.preventDefault();
        const pbId = document.getElementById('withdraw-piggybank-id').value;
        const amount = parseFloat(document.getElementById('withdraw-amount').value);

        if (amount < 0) {
            showToast('La cantidad no puede ser negativa', 'error');
            return;
        }

        const subject = document.getElementById('withdraw-subject').value.trim();
        const toGlobal = document.getElementById('withdraw-to-global').checked;
        const pb = piggybanks.get(pbId);
        
        if (!pb) return;
        
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        
        const timestamp = new Date().toISOString();
        
        let expenseConcept = toGlobal ? `Transferencia desde ${pb.name}` : `Gasto de hucha`;
        if (subject) {
            expenseConcept += `: ${subject}`;
        }
        
        // 1. Expense from Piggybank (Reduce PB balance)
        const res1 = await apiCall('/api/transaction', 'POST', {
             type: 'expense',
             concept: expenseConcept,
             amount: amount,
             currency: pb.currency,
             timestamp: timestamp,
             piggybank_id: pbId,
             piggybank_name: pb.name,
             piggybank_goal: pb.goal
        });
        
        let res2 = { success: true };
        // 2. If transfer to global, create income in global
        if (toGlobal) {
             res2 = await apiCall('/api/transaction', 'POST', {
                type: 'income',
                concept: `Transferencia desde hucha: ${pb.name}${subject ? ` (${subject})` : ''}`,
                amount: amount,
                currency: pb.currency,
                timestamp: timestamp,
                piggybank_id: '' // Global
            });
        }
        
        if (res1.success && res2.success) {
            document.getElementById('modal-withdraw').style.display = 'none';
            document.getElementById('form-withdraw').reset();
            showToast(toGlobal ? 'Fondos transferidos al saldo global' : 'Gasto registrado correctamente', 'success');
            loadData();
        } else {
            showToast('Error al procesar la solicitud', 'error');
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
      
      if (amountFrom < 0) {
          showToast('La cantidad no puede ser negativa', 'error');
          return;
      }

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
      
      const incomes = transactions.filter(t => t.type === 'income' && !t.external);
      const expenses = transactions.filter(t => t.type === 'expense' && !t.external);
      
      incomes.forEach(income => {
        const currency = income.currency || '€';
        if (income.piggybank_id) {
             // Linked to piggybank
        } else {
          if (currency === '€') {
            euroBalance.income += income.amount;
          } else if (currency === '$') {
            dollarBalance.income += income.amount;
          }
        }
      });
      
      piggybanks.forEach((pb, id) => {
          if (pb.type === 'savings' && !pb.created_from_expense && pb.overflow > 0) {
              if (pb.currency === '€') euroBalance.income += pb.overflow;
              if (pb.currency === '$') dollarBalance.income += pb.overflow;
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
      
      const updateEl = (id, amount, symbol) => {
          const el = document.getElementById(id);
          if (el) {
              if (amount < 0) {
                  el.style.color = 'var(--color-expense)';
              } else {
                  el.style.color = 'var(--text-primary)';
              }
              
              el.innerHTML = `${amount.toFixed(2)}<span class="text-4xl theme-text-secondary font-light ml-1">${symbol}</span>`;
          }
      };
      
      updateEl('balance-euro', euroTotal, '€');
      updateEl('balance-dollar', dollarTotal, '$');
    }
    
    function updatePiggybanks() {
        piggybanks.forEach((pb, id) => {
             const incomes = transactions.filter(t => t.type === 'income' && t.piggybank_id === id);
             const expenses = transactions.filter(t => t.type === 'expense' && t.piggybank_id === id);
             
             const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);
             const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
             
             // Calculate composition of funds
             const totalInternal = incomes.filter(t => !t.external).reduce((sum, t) => sum + t.amount, 0);
             
             pb.totalIncome = totalIncome;
             pb.totalExpense = totalExpense;
             pb.totalInternal = totalInternal; // Store for spend logic
             pb.overflow = 0; // Initialize

             if (pb.created_from_expense) {
                 pb.current = totalIncome - totalExpense;
                 pb.completed = pb.current >= 0; 
             } else if (pb.type === 'budget') {
                 pb.current = totalIncome - totalExpense;
                 pb.completed = false; 
             } else {
                 // Savings Hucha Logic: 
                 // 1. Incomes up to the goal stay in the hucha.
                 // 2. Incomes above the goal go to global balance (overflow).
                 // 3. Expenses always subtract from the hucha's part.
                 pb.overflow = Math.max(0, totalIncome - pb.goal);
                 pb.current = Math.min(totalIncome, pb.goal) - totalExpense;
                 pb.completed = pb.current >= pb.goal && pb.goal > 0;
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
             noPiggybanks.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p class="text-xl theme-text-secondary">No se encontraron huchas.</p>
                </div>`;
             noPiggybanks.style.display = 'block';
        } else {
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
        
        let subText = `<span class="text-xs uppercase tracking-wider text-gray-400 font-semibold">Objetivo</span> <span class="font-medium">${piggybank.goal.toFixed(2)}${piggybank.currency || '€'}</span>`;
        let mainValue = `${displayCurrent.toFixed(2)}${piggybank.currency || '€'}`;
        let barColor = isCompleted ? 'var(--color-income)' : 'var(--color-accent)'; 
        
        // Icons
        let iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
        let typeBadge = '<span class="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">Ahorro</span>';

        if (isExpenseTracker) {
            displayCurrent = piggybank.current; // Net Balance
            isCompleted = piggybank.completed;
            
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
            typeBadge = '<span class="badge badge-expense">Gasto</span>';

            // Calculate progress
            let debt = piggybank.goal;
            let paid = piggybank.totalIncome;
            if (debt > 0) {
                percentage = (paid / debt) * 100;
            } else {
                percentage = paid >= 0 ? 100 : 0;
            }
            
            subText = `<span class="text-xs uppercase tracking-wider text-gray-400 font-semibold">Total Gastado</span> <span class="font-medium">${piggybank.goal.toFixed(2)}${piggybank.currency || '€'}</span>`;
            barColor = 'var(--color-income)';
            
            if (isCompleted) {
                 percentage = 100;
                 subText = '<span class="text-xs font-bold text-green-500 uppercase tracking-wider">¡Deuda Pagada!</span>';
            } else {
                if (displayCurrent < 0) {
                     mainValue = `<span class="text-red-500 font-bold">${displayCurrent.toFixed(2)}${piggybank.currency || '€'}</span>`;
                } else {
                     mainValue = `<span class="text-green-500 font-bold">+${displayCurrent.toFixed(2)}${piggybank.currency || '€'}</span>`;
                }
            }
        } else if (isBudget) {
            displayCurrent = piggybank.current;
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`;
            typeBadge = '<span class="badge bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">Presupuesto</span>';
            subText = `<span class="text-xs uppercase tracking-wider text-gray-400 font-semibold">Disponible</span>`;
            
            if (displayCurrent < 0) {
                mainValue = `<span class="text-red-500 font-bold">${displayCurrent.toFixed(2)}${piggybank.currency || '€'}</span>`;
                subText = `<span class="text-red-500 font-bold text-xs uppercase">¡En números rojos!</span>`;
            }
        }
        
        const card = document.createElement('div');
        card.className = 'glass rounded-3xl p-6 relative overflow-hidden shadow-sm hover-card-effect group';
        
        let footerActions = '';
        
        const btnClassBase = "flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-1";
        const btnClassIncome = `${btnClassBase} bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40`;
        const btnClassExpense = `${btnClassBase} bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40`;
        const btnClassNeutral = `${btnClassBase} bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600`;

        if (isBudget) {
             footerActions = `
                <div class="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                    <button class="btn-refill-piggybank ${btnClassIncome}" data-id="${id}">
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                       Rellenar
                    </button>
                    ${piggybank.current > 0 ? `
                    <button class="btn-withdraw-piggybank ${btnClassExpense}" data-id="${id}">
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>
                       Gastar
                    </button>` : ''}
                </div>`;
        } else if (isExpenseTracker) {
             if (isCompleted) {
                 footerActions = `
                    <div class="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 text-center">
                        <p class="theme-text-secondary text-xs">Hucha saldada. Puedes eliminarla para archivarla.</p>
                    </div>`;
             } else {
                 footerActions = `
                    <div class="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                        <button class="btn-refill-piggybank ${btnClassIncome}" data-id="${id}">
                           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                           Añadir saldo
                        </button>
                    </div>`;
             }
        } else {
            // SAVINGS Logic
            footerActions = `
                <div class="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                    ${!isCompleted ? `
                    <button class="btn-refill-piggybank ${btnClassIncome}" data-id="${id}">
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                       Añadir saldo
                    </button>` : `
                    <button class="btn-spend-piggybank ${btnClassNeutral}" data-id="${id}">
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                       Gastar hucha
                    </button>`}
                </div>
                ${isCompleted ? '<div class="mt-2 text-center text-xs text-green-600 font-bold uppercase tracking-wider">¡Objetivo completado!</div>' : ''}
            `;
        }
        
        card.innerHTML = `
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3 overflow-hidden">
              <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                ${iconSvg}
              </div>
              <div class="overflow-hidden">
                  <h3 class="font-bold theme-text-primary text-lg truncate leading-tight mb-0.5" title="${piggybank.name}">
                    ${piggybank.name}
                  </h3>
                  ${typeBadge}
              </div>
            </div>
            <div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button class="edit-piggybank p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 transition-colors" data-id="${id}" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                 </button>
                 <button class="delete-piggybank p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors" data-id="${id}" title="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                 </button>
            </div>
          </div>
          
          <div class="mb-2">
            <div class="flex justify-between items-end mb-2">
              <span class="text-2xl font-bold theme-text-primary tracking-tight">${mainValue}</span>
              <div class="text-right text-sm">${subText}</div>
            </div>
            ${(!isBudget) ? `
            <div class="w-full bg-gray-100 dark:bg-gray-700/50 rounded-full h-2 overflow-hidden">
              <div class="progress-bar h-full rounded-full transition-all duration-700" style="width: ${Math.max(0, Math.min(percentage, 100))}%; background-color: ${barColor}"></div>
            </div>
            <div class="text-right mt-1 text-xs text-gray-400 font-medium">${percentage.toFixed(0)}%</div>` : ''}
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
            
            // Check for surplus in Expense Tracker to transfer to Global
            if (piggybank.created_from_expense && piggybank.current > 0) {
                 await apiCall('/api/transaction', 'POST', {
                      type: 'income',
                      concept: `Excedente de hucha de gasto: ${piggybank.name}`,
                      amount: piggybank.current,
                      currency: piggybank.currency,
                      timestamp: new Date().toISOString(),
                      piggybank_id: '' // Global
                  });
            }

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
                 
                 const goalContainer = document.getElementById('edit-piggybank-goal-container');
                 const goalInput = document.getElementById('edit-piggybank-goal');
                 
                 // Hide goal field for all piggybanks (Goal is not editable once created)
                 goalContainer.classList.add('hidden');
                 goalInput.required = false;

                 document.getElementById('modal-piggybank-edit').style.display = 'flex';
             }
        });
      });

      document.querySelectorAll('.btn-spend-piggybank').forEach(btn => {
          btn.addEventListener('click', async (e) => {
              const id = e.target.dataset.id;
              const pb = piggybanks.get(id);
              if (pb && confirm(`¿Quieres registrar el gasto de la hucha "${pb.name}"? Se creará un gasto por valor de ${pb.goal}${pb.currency}.`)) {
                  
                  // Calculate split based on source of funds to preserve Global Balance neutrality
                  // We prioritize using Internal funds up to the amount available, then External.
                  // This ensures that if we release Internal Income (by deleting PB), we match it with Internal Expense.
                  const amountInternal = Math.max(0, Math.min(pb.goal, pb.totalInternal));
                  const amountExternal = Math.max(0, pb.goal - amountInternal);
                  
                  let success = true;

                  // 1. Internal Expense
                  if (amountInternal > 0) {
                      const res = await apiCall('/api/transaction', 'POST', {
                          type: 'expense',
                          concept: pb.name,
                          amount: amountInternal,
                          currency: pb.currency,
                          timestamp: new Date().toISOString(),
                          piggybank_id: id,
                          piggybank_name: pb.name,
                          piggybank_goal: pb.goal,
                          external: false
                      });
                      if (!res || !res.success) success = false;
                  }
                  
                  // 2. External Expense
                  if (success && amountExternal > 0) {
                      const res = await apiCall('/api/transaction', 'POST', {
                          type: 'expense',
                          concept: pb.name, // Keep same name or append (Externo)? Keeping same clean.
                          amount: amountExternal,
                          currency: pb.currency,
                          timestamp: new Date().toISOString(),
                          piggybank_id: id,
                          piggybank_name: pb.name,
                          piggybank_goal: pb.goal,
                          external: true
                      });
                      if (!res || !res.success) success = false;
                  }
                  
                  if (success) {
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
               const pb = piggybanks.get(id);
               
               document.getElementById('withdraw-piggybank-id').value = id;
               
               const transferContainer = document.getElementById('withdraw-transfer-container');
               const modalTitle = document.getElementById('withdraw-modal-title');
               const modalDesc = document.getElementById('withdraw-modal-desc');
               
               if (pb && pb.type === 'budget') {
                   transferContainer.classList.remove('hidden');
                   modalTitle.textContent = '💸 Gestionar Presupuesto';
                   modalDesc.textContent = 'Registra un gasto o transfiere fondos al saldo global.';
               } else {
                   transferContainer.classList.add('hidden');
                   modalTitle.textContent = '💸 Gastar de la Hucha';
                   modalDesc.textContent = 'Registrar un gasto directamente desde la hucha.';
               }
               
               document.getElementById('modal-withdraw').style.display = 'flex';
          });
      });

      document.querySelectorAll('.btn-refill-piggybank').forEach(btn => {
          btn.addEventListener('click', (e) => {
               const id = e.target.dataset.id;
               const pb = piggybanks.get(id);
               
               document.getElementById('refill-piggybank-id').value = id;
               
               const modalTitle = document.querySelector('#modal-refill h3');
               if (pb.type === 'budget') {
                   modalTitle.textContent = '📥 Rellenar Presupuesto';
               } else if (pb.created_from_expense) {
                   modalTitle.textContent = '📥 Añadir Saldo'; // Expense Tracker
               } else {
                   modalTitle.textContent = '📥 Añadir Ahorro'; // Savings
               }

               document.getElementById('modal-refill').style.display = 'flex';
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
        noIncome.style.display = 'flex'; // Flex for center alignment
      } else {
        noIncome.style.display = 'none';
        incomeList.innerHTML = filteredIncomes.map(income => `
          <div class="transaction-item glass p-4 rounded-2xl flex justify-between items-center mb-3 group hover:border-green-200 dark:hover:border-green-900 transition-colors">
            <div class="flex items-center gap-3">
                <div class="p-2.5 rounded-xl ${income.external ? 'bg-gray-100 text-gray-400 dark:bg-gray-800' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                </div>
                <div>
                  <p class="font-bold theme-text-primary text-sm">
                    ${income.concept}
                  </p>
                  <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-xs theme-text-secondary">${new Date(income.timestamp).toLocaleDateString()}</span>
                      ${income.piggybank_name ? `<span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 theme-text-secondary flex items-center gap-1">🐷 ${income.piggybank_name}</span>` : ''}
                      ${income.edited ? '<span class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">Editado</span>' : ''}
                      ${income.external ? '<span class="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">Externo</span>' : ''}
                  </div>
                </div>
            </div>
            <div class="text-right">
              <p class="font-bold text-lg" style="color: ${income.external ? 'var(--text-secondary)' : 'var(--color-income)'}">+${income.amount.toFixed(2)}${income.currency || '€'}</p>
              <div class="flex gap-1 justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="edit-transaction p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" data-id="${income.id}" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button class="delete-transaction p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" data-id="${income.id}" title="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          </div>
        `).join('');
      }
      
      if (filteredExpenses.length === 0) {
        expenseList.innerHTML = '';
        noExpenses.style.display = 'flex';
      } else {
        noExpenses.style.display = 'none';
        expenseList.innerHTML = filteredExpenses.map(expense => `
          <div class="transaction-item glass p-4 rounded-2xl flex justify-between items-center mb-3 group hover:border-red-200 dark:hover:border-red-900 transition-colors">
            <div class="flex items-center gap-3">
                <div class="p-2.5 rounded-xl ${expense.external ? 'bg-gray-100 text-gray-400 dark:bg-gray-800' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                    </svg>
                </div>
                <div>
                  <p class="font-bold theme-text-primary text-sm">
                    ${expense.concept}
                  </p>
                  <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-xs theme-text-secondary">${new Date(expense.timestamp).toLocaleDateString()}</span>
                      ${expense.piggybank_name ? `<span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 theme-text-secondary flex items-center gap-1">🐷 ${expense.piggybank_name}</span>` : ''}
                      ${expense.edited ? '<span class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">Editado</span>' : ''}
                      ${expense.external ? '<span class="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">Externo</span>' : ''}
                  </div>
                </div>
            </div>
            <div class="text-right">
              <p class="font-bold text-lg" style="color: ${expense.external ? 'var(--text-secondary)' : 'var(--color-expense)'}">-${expense.amount.toFixed(2)}${expense.currency || '€'}</p>
              <div class="flex gap-1 justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="edit-transaction p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" data-id="${expense.id}" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button class="delete-transaction p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" data-id="${expense.id}" title="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
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
            if(!confirm('¿Eliminar esta transacción?')) return;
            
            btn.disabled = true;
            btn.textContent = '...'; // Small placeholder
            
            const result = await apiCall('/api/transaction', 'DELETE', { id: transaction.id });
            if (result && result.success) {
                showToast('Transacción eliminada', 'success');
                loadData();
            } else {
                showToast('Error al eliminar', 'error');
                btn.disabled = false;
                btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
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
      expenseSelect.innerHTML = '<option value="">No, gasto general</option>';
      
      piggybanks.forEach((piggybank, id) => {
        // Income Select
        if (!piggybank.completed) {
          let label = `${piggybank.name}`;
          if (piggybank.type === 'budget') {
              label += ` (Disponible: ${piggybank.current.toFixed(2)} ${piggybank.currency})`;
          } else if (piggybank.created_from_expense) {
              label += ` (Saldo: ${piggybank.current.toFixed(2)} ${piggybank.currency})`;
          } else {
              label += ` (${piggybank.current.toFixed(2)}/${piggybank.goal.toFixed(2)} ${piggybank.currency})`;
          }
          incomeSelect.innerHTML += `<option value="${id}">${label}</option>`;
        }
        
        // Expense Select
        // Show in expense select if it has funds OR if it's an expense tracker
        if (piggybank.current > 0 || piggybank.created_from_expense || piggybank.type === 'budget') {
            let label = `${piggybank.name}`;
            if (piggybank.created_from_expense) {
                label += ` (Acumulado: ${piggybank.goal.toFixed(2)} ${piggybank.currency})`;
            } else {
                label += ` (Disponible: ${piggybank.current.toFixed(2)} ${piggybank.currency})`;
            }
            expenseSelect.innerHTML += `<option value="${id}">${label}</option>`;
        }
      });
    }
    
    function showToast(message, type) {
      const toast = document.createElement('div');
      const isSuccess = type === 'success';
      const bgColor = isSuccess ? 'bg-green-600' : 'bg-red-600';
      const icon = isSuccess ? '✅' : '⚠️';
      
      toast.className = `fixed bottom-6 right-6 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-slide-in z-50 text-white ${bgColor}`;
      
      toast.innerHTML = `
        <span class="text-xl">${icon}</span>
        <span class="font-medium">${message}</span>
      `;
      
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.style.transition = 'all 0.5s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 500);
      }, 3000);
    }
    
    // Start
    initApp();