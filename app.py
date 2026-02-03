import os
import json
import uuid
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DATA_FILE = 'data.json'

def load_data():
    if not os.path.exists(DATA_FILE):
        return {'transactions': [], 'piggybanks': []}
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {'transactions': [], 'piggybanks': []}

def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    data = load_data()
    return jsonify(data)

@app.route('/api/data', methods=['DELETE'])
def delete_all_data():
    data = {'transactions': [], 'piggybanks': []}
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/transaction', methods=['POST'])
def add_transaction():
    data = load_data()
    new_transaction = request.json
    
    # Ensure ID exists
    if 'id' not in new_transaction or not new_transaction['id']:
        new_transaction['id'] = str(uuid.uuid4())
    
    # Ensure required fields
    required = ['type', 'amount', 'currency']
    if not all(k in new_transaction for k in required):
        return jsonify({'success': False, 'message': 'Missing fields'}), 400

    # FORCE RULE: External EXPENSES cannot have a piggybank
    if new_transaction.get('external') and new_transaction.get('type') == 'expense':
        new_transaction['piggybank_id'] = ''
        new_transaction['create_piggybank'] = False # Disable creation if external

    # Handle "Create Piggybank from Expense" logic
    if new_transaction.get('create_piggybank') and new_transaction.get('new_piggybank_name'):
        new_pb_id = str(uuid.uuid4())
        new_pb = {
            'id': new_pb_id,
            'concept': new_transaction['new_piggybank_name'],
            'amount': new_transaction['amount'], # Initial goal = expense amount
            'currency': new_transaction['currency'],
            'timestamp': new_transaction.get('timestamp'),
            'created_from_expense': True
        }
        data['piggybanks'].append(new_pb)
        
        # Link transaction to this new piggybank
        new_transaction['piggybank_id'] = new_pb_id
        new_transaction['piggybank_name'] = new_pb['concept']
        new_transaction['piggybank_goal'] = new_pb['amount']
        
        # Remove temporary fields so they don't pollute transaction data
        del new_transaction['create_piggybank']
        del new_transaction['new_piggybank_name']
        
    # Handle "Add to existing Expense-Type Piggybank" logic
    elif new_transaction.get('piggybank_id'):
        pb_id = str(new_transaction['piggybank_id'])
        # Find the piggybank
        for i, pb in enumerate(data['piggybanks']):
            if pb['id'] == pb_id:
                # If it's a dynamic expense tracker, update the goal
                if pb.get('created_from_expense') and new_transaction['type'] == 'expense':
                    pb['amount'] += new_transaction['amount']
                    data['piggybanks'][i] = pb
                    
                    # Update the transaction's snapshot of the goal
                    new_transaction['piggybank_goal'] = pb['amount']
                    
                    # Optional: Update ALL other transactions linked to this PB to reflect new goal?
                    # The update_piggybank route does it. Let's do it for consistency.
                    for t in data['transactions']:
                        if t.get('piggybank_id') == pb_id:
                            t['piggybank_goal'] = pb['amount']
                break

    data['transactions'].append(new_transaction)
    save_data(data)
    return jsonify({'success': True, 'transaction': new_transaction})

@app.route('/api/transaction', methods=['PUT'])
def update_transaction():
    data = load_data()
    updated_transaction = request.json
    
    if 'id' not in updated_transaction:
        return jsonify({'success': False, 'message': 'ID required'}), 400
        
    # Find and update
    for i, t in enumerate(data['transactions']):
        if t['id'] == updated_transaction['id']:
            
            # FORCE RULE: External EXPENSES cannot have a piggybank
            if updated_transaction.get('external') and updated_transaction.get('type') == 'expense':
                # If it was previously linked to a piggybank, we might need to adjust that piggybank
                prev_pb_id = t.get('piggybank_id')
                if prev_pb_id:
                     # Check if it was an Expense Tracker piggybank
                     pb_index = next((idx for idx, p in enumerate(data['piggybanks']) if p['id'] == prev_pb_id), None)
                     if pb_index is not None:
                         pb = data['piggybanks'][pb_index]
                         if pb.get('created_from_expense'):
                             # Reduce the goal by the OLD amount (the amount that was contributing to it)
                             pb['amount'] = max(0, pb['amount'] - t['amount'])
                             data['piggybanks'][pb_index] = pb
                             
                             # Update all other transactions linked to this PB
                             for other_t in data['transactions']:
                                 if other_t.get('piggybank_id') == prev_pb_id:
                                     other_t['piggybank_goal'] = pb['amount']

                updated_transaction['piggybank_id'] = ''
                updated_transaction['piggybank_name'] = ''
                updated_transaction['piggybank_goal'] = 0

            # Handle Piggybank Goal updates for 'created_from_expense' types
            # Only proceed if NOT external (or if external logic didn't clear it already, though it did)
            pb_id = str(updated_transaction.get('piggybank_id')) if updated_transaction.get('piggybank_id') else None
            if pb_id and updated_transaction['type'] == 'expense' and not updated_transaction.get('external'):
                # Find the piggybank
                pb_index = next((idx for idx, p in enumerate(data['piggybanks']) if p['id'] == pb_id), None)
                if pb_index is not None:
                    pb = data['piggybanks'][pb_index]
                    if pb.get('created_from_expense'):
                        # If the transaction was ALREADY in this piggybank, diff the amount
                        if t.get('piggybank_id') == pb_id:
                            old_amount = t['amount']
                            new_amount = updated_transaction['amount']
                            diff = new_amount - old_amount
                            if diff != 0:
                                pb['amount'] += diff
                        # If it wasn't (e.g. was external or global before), add full amount
                        else:
                             pb['amount'] += updated_transaction['amount']

                        data['piggybanks'][pb_index] = pb
                        
                        # Update goal in current transaction object to be saved
                        updated_transaction['piggybank_goal'] = pb['amount']
                        
                        # Update all other transactions linked to this PB
                        for other_t in data['transactions']:
                            if other_t.get('piggybank_id') == pb_id and other_t['id'] != t['id']:
                                other_t['piggybank_goal'] = pb['amount']

            # Mark as edited
            updated_transaction['edited'] = True
            data['transactions'][i] = updated_transaction
            save_data(data)
            return jsonify({'success': True})
            
    return jsonify({'success': False, 'message': 'Transaction not found'}), 404

@app.route('/api/transaction', methods=['DELETE'])
def delete_transaction():
    data = load_data()
    req = request.json
    t_id = req.get('id')
    
    transaction_to_delete = next((t for t in data['transactions'] if t['id'] == t_id), None)
    
    if transaction_to_delete:
        # Check if we need to update a Piggybank (Expense Tracker type)
        pb_id = transaction_to_delete.get('piggybank_id')
        if pb_id and transaction_to_delete['type'] == 'expense':
             for i, pb in enumerate(data['piggybanks']):
                if pb['id'] == pb_id and pb.get('created_from_expense'):
                    # Reduce the goal/amount
                    pb['amount'] = max(0, pb['amount'] - transaction_to_delete['amount'])
                    data['piggybanks'][i] = pb
                    
                    # Update all transactions linked to this PB with new goal
                    for t in data['transactions']:
                        if t.get('piggybank_id') == pb_id:
                            t['piggybank_goal'] = pb['amount']
                    break

        data['transactions'] = [t for t in data['transactions'] if t['id'] != t_id]
        save_data(data)
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'message': 'Transaction not found'}), 404

@app.route('/api/piggybank', methods=['POST'])
def add_piggybank():
    data = load_data()
    piggybank = request.json
    
    if 'id' not in piggybank or not piggybank['id']:
        piggybank['id'] = str(uuid.uuid4())
        
    data['piggybanks'].append(piggybank)
    save_data(data)
    return jsonify({'success': True, 'piggybank': piggybank})

@app.route('/api/piggybank', methods=['PUT'])
def update_piggybank():
    data = load_data()
    updated_pb = request.json
    
    if 'id' not in updated_pb:
         return jsonify({'success': False, 'message': 'ID required'}), 400
         
    for i, pb in enumerate(data['piggybanks']):
        if pb['id'] == updated_pb['id']:
            # Update fields
            pb['concept'] = updated_pb.get('concept', pb['concept'])
            pb['amount'] = updated_pb.get('amount', pb['amount'])
            # Ensure currency matches or handle conversion (for now assume fixed currency)
            data['piggybanks'][i] = pb
            
            # Also update the denormalized name/goal in transactions? 
            # The current backend stores 'piggybank_name' in transactions for convenience, 
            # but strictly it should be joined. The frontend handles logic mostly.
            # But let's update them to keep data consistent if we rely on it.
            for t in data['transactions']:
                if t.get('piggybank_id') == pb['id']:
                    t['piggybank_name'] = pb['concept']
                    t['piggybank_goal'] = pb['amount']
            
            save_data(data)
            return jsonify({'success': True})

    return jsonify({'success': False, 'message': 'Piggybank not found'}), 404

@app.route('/api/piggybank', methods=['DELETE'])
def delete_piggybank():
    data = load_data()
    req = request.json
    p_id = str(req.get('id', '')).strip()
    
    # Find the piggybank to check its type
    pb_to_delete = next((p for p in data['piggybanks'] if str(p.get('id', '')).strip() == p_id), None)
    is_expense_tracker = pb_to_delete.get('created_from_expense') if pb_to_delete else False

    # Remove piggybank definition
    data['piggybanks'] = [p for p in data['piggybanks'] if str(p.get('id', '')).strip() != p_id]
    
    # Calculate balance of the piggybank being deleted to determine completion status for Expense Trackers
    pb_balance = 0
    pb_transactions = [t for t in data['transactions'] if str(t.get('piggybank_id', '')).strip() == p_id]
    
    for t in pb_transactions:
        amount = t['amount']
        if t['type'] == 'income':
            pb_balance += amount
        else:
            pb_balance -= amount
            
    is_completed = pb_balance >= 0

    # Unset piggybank_id but KEEP piggybank_name for history
    for t in data['transactions']:
        # Compare stripped strings to ensure match
        t_pb_id = str(t.get('piggybank_id', '')).strip()
        if t_pb_id == p_id:
            t['piggybank_id'] = None 
            
            if is_expense_tracker:
                if is_completed:
                    # If completed, we integrate everything to history.
                    # Income (+X) and Expense (-X) cancel out in Global Balance.
                    t['external'] = False
                else:
                    # If incomplete (debt exists), we cancel the debt but refund payments.
                    if t['type'] == 'income':
                        t['external'] = False # Refund payment to global
                    else:
                        t['external'] = True  # Cancel debt (hide expense)
            else:
                # Savings/Budget: Always integrate to global
                t['external'] = False
            
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/exchange', methods=['POST'])
def exchange_currency():
    data = load_data()
    req = request.json
    
    # Needs: amountFrom, currencyFrom, amountTo, currencyTo
    if not all(k in req for k in ['amountFrom', 'currencyFrom', 'amountTo', 'currencyTo']):
         return jsonify({'success': False, 'message': 'Missing exchange data'}), 400

    timestamp = req.get('timestamp')
    
    # 1. Expense Transaction (Selling Currency)
    expense = {
        'id': str(uuid.uuid4()),
        'type': 'expense',
        'concept': f"Cambio a {req['currencyTo']}",
        'amount': req['amountFrom'],
        'currency': req['currencyFrom'],
        'timestamp': timestamp,
        'piggybank_id': '',
        'exchange_ref': True
    }
    
    # 2. Income Transaction (Buying Currency)
    income = {
        'id': str(uuid.uuid4()),
        'type': 'income',
        'concept': f"Cambio desde {req['currencyFrom']}",
        'amount': req['amountTo'],
        'currency': req['currencyTo'],
        'timestamp': timestamp,
        'piggybank_id': '',
        'exchange_ref': True
    }
    
    data['transactions'].append(expense)
    data['transactions'].append(income)
    save_data(data)
    
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
