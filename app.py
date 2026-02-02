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
            # Mark as edited if concept/amount changed (simple check)
            # Frontend already sends 'edited': true, but we can enforce it
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
    
    initial_len = len(data['transactions'])
    data['transactions'] = [t for t in data['transactions'] if t['id'] != t_id]
    
    if len(data['transactions']) < initial_len:
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

@app.route('/api/piggybank', methods=['DELETE'])
def delete_piggybank():
    data = load_data()
    req = request.json
    p_id = req.get('id')
    
    # Remove piggybank definition
    data['piggybanks'] = [p for p in data['piggybanks'] if p['id'] != p_id]
    
    # Also unset piggybank_id from transactions associated with it
    for t in data['transactions']:
        if t.get('piggybank_id') == p_id:
            t['piggybank_id'] = ''
            t['piggybank_name'] = ''
            
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
