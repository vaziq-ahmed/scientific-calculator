// State
let expression = '';
let isDegreeMode = true;
let history = JSON.parse(localStorage.getItem('calcHistory')) || [];

// DOM Elements
const displayEl = document.getElementById('display');
const historyEl = document.getElementById('history');
const toggleBtn = document.getElementById('toggle-deg-rad');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');

// Configuration for parsing
const functionNames = ['sin', 'cos', 'tan', 'log', 'ln', '√'];
const constants = { 'π': Math.PI, 'e': Math.E };
const PRECEDENCE = {
    '+': 1,
    '−': 1,
    '×': 2,
    '÷': 2,
    '%': 2,
    '^': 3
};

// Initialize
function init() {
    updateDisplay();
    renderHistory();
    setupEventListeners();
}

// --- Event Listeners ---
function setupEventListeners() {
    // Button Clicks
    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Handle Action buttons first
            if (btn.dataset.action) {
                handleAction(btn.dataset.action);
            } else if (btn.dataset.value) {
                handleInput(btn.dataset.value);
            }
        });
    });

    // Toggle DEG/RAD
    toggleBtn.addEventListener('click', () => {
        isDegreeMode = !isDegreeMode;
        toggleBtn.textContent = isDegreeMode ? 'DEG' : 'RAD';
        toggleBtn.classList.toggle('active', !isDegreeMode);
    });

    // History Panel
    document.getElementById('close-history').addEventListener('click', () => {
        historyPanel.classList.remove('open');
    });
    document.getElementById('clear-history').addEventListener('click', () => {
        history = [];
        saveHistory();
        renderHistory();
    });

    // Keyboard support
    window.addEventListener('keydown', handleKeyboard);
}

// --- Input Handling ---
function handleInput(val) {
    if (displayEl.classList.contains('error')) clear();

    // Auto insert multiply if previous was number/bracket and current is bracket/fn/const
    const lastChar = expression.slice(-1);
    const isNum = /\d/.test(lastChar) || lastChar === '.';
    const isConstOrBrackClose = lastChar === 'π' || lastChar === 'e' || lastChar === ')';

    const nextIsFuncOrConstOpenBrack = val.match(/^[a-z]+|\(|π|e|√/i);

    if (expression.length > 0 && (isNum || isConstOrBrackClose) && nextIsFuncOrConstOpenBrack && val !== '.') {
        expression += '×';
    }

    expression += val;
    updateDisplay();
}

function handleAction(action) {
    if (displayEl.classList.contains('error')) clear();

    switch (action) {
        case 'clear':
            clear();
            break;
        case 'delete':
            expression = expression.slice(0, -1);
            updateDisplay();
            break;
        case 'calculate':
            calculate();
            break;
        case 'square':
            handleInput('^2');
            break;
        case 'history':
            historyPanel.classList.add('open');
            break;
        case 'copy':
            navigator.clipboard.writeText(displayEl.textContent);
            break;
        // Basic Memory (simplistic implementation)
        case 'mc':
            localStorage.removeItem('calcMemory');
            break;
        case 'm+': {
            const mem = parseFloat(localStorage.getItem('calcMemory') || 0);
            try {
                const res = evaluateExpr(expression);
                localStorage.setItem('calcMemory', mem + res);
            } catch (e) { }
            break;
        }
        case 'm-': {
            const mem = parseFloat(localStorage.getItem('calcMemory') || 0);
            try {
                const res = evaluateExpr(expression);
                localStorage.setItem('calcMemory', mem - res);
            } catch (e) { }
            break;
        }
        case 'mr':
            handleInput(localStorage.getItem('calcMemory') || '0');
            break;
    }
}

function handleKeyboard(e) {
    const keyMap = {
        'Enter': 'calculate',
        '=': 'calculate',
        'Backspace': 'delete',
        'Escape': 'clear',
        '*': '×',
        '/': '÷',
        '-': '−',
        '+': '+'
    };

    if (keyMap[e.key]) {
        e.preventDefault();
        handleAction(keyMap[e.key]);
    } else if (/^[0-9.()%\^]$/.test(e.key) || Object.values(keyMap).includes(e.key)) {
        e.preventDefault();
        handleInput(keyMap[e.key] || e.key);
    } else if (['s', 'c', 't', 'l', 'p', 'e'].includes(e.key.toLowerCase())) {
        // Quick short cuts
        const fnMap = { 's': 'sin(', 'c': 'cos(', 't': 'tan(', 'l': 'log(', 'p': 'π', 'e': 'e' };
        if (fnMap[e.key.toLowerCase()]) {
            handleInput(fnMap[e.key.toLowerCase()]);
        }
    }
}

function clear() {
    expression = '';
    displayEl.classList.remove('error');
    updateDisplay();
    historyEl.textContent = '';
}

function updateDisplay() {
    displayEl.textContent = expression || '0';
    // Auto scroll right
    displayEl.scrollLeft = displayEl.scrollWidth;
}


// --- Main Evaluation Logic ---

function calculate() {
    if (!expression) return;

    try {
        const result = evaluateExpr(expression);

        // Format result: remove trailing zero to 10 decimal places to fix float issues
        let formattedResult = parseFloat(result.toFixed(10)).toString();

        // Update History
        addToHistory(expression, formattedResult);

        // Update display
        historyEl.textContent = expression + ' =';
        expression = formattedResult;
        displayEl.classList.remove('error');
        updateDisplay();

    } catch (err) {
        displayEl.textContent = 'Error';
        displayEl.classList.add('error');
        console.error(err);
    }
}


// --- Parser Engine (Shunting Yard algorithm + Reverse Polish Notation Evaluator) ---

function evaluateExpr(expr) {
    // 1. Tokenize
    const tokens = tokenize(expr);
    // 2. Infix to Postfix (Shunting Yard)
    const postfix = toPostfix(tokens);
    // 3. Evaluate Postfix
    return evaluatePostfix(postfix);
}

function tokenize(expr) {
    const tokens = [];
    let currentNumber = '';
    let i = 0;

    // Fix implicit unary minus at start or after open parenthesis
    let isUnaryMinusContext = true;

    while (i < expr.length) {
        const char = expr[i];

        // Number/decimal
        if (/[0-9.]/.test(char)) {
            currentNumber += char;
            isUnaryMinusContext = false;
        } else {
            if (currentNumber !== '') {
                tokens.push(parseFloat(currentNumber));
                currentNumber = '';
            }

            // Check constants
            if (char === 'π' || char === 'e') {
                tokens.push(constants[char]);
                isUnaryMinusContext = false;
            }
            // Operators and Parentheses
            else if (['+', '−', '×', '÷', '^', '%', '(', ')', '√'].includes(char)) {

                // Handle unary minus
                if (char === '−' && isUnaryMinusContext) {
                    currentNumber += '-';  // Attach to next number
                } else {
                    tokens.push(char);
                    isUnaryMinusContext = char !== ')'; // Need unary after operator or '('
                }

            }
            // Check for functions (sin, cos, tan, log, ln)
            else if (/[a-z]/i.test(char)) {
                let func = '';
                while (i < expr.length && /[a-z]/i.test(expr[i])) {
                    func += expr[i];
                    i++;
                }

                if (functionNames.includes(func)) {
                    tokens.push(func);
                    isUnaryMinusContext = true; // Open paren comes next usually
                    i--; // adjust loop increment
                }
            }
        }
        i++;
    }

    if (currentNumber !== '') {
        tokens.push(parseFloat(currentNumber));
    }

    return tokens;
}

function toPostfix(tokens) {
    const output = [];
    const opStack = [];

    for (const token of tokens) {
        if (typeof token === 'number') {
            output.push(token);
        } else if (functionNames.includes(token) || token === '√') {
            opStack.push(token);
        } else if (token === '(') {
            opStack.push(token);
        } else if (token === ')') {
            while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
                output.push(opStack.pop());
            }
            if (opStack.length === 0) throw new Error('Mismatched parentheses');
            opStack.pop(); // Remove '('

            // If the top of the stack is a function, pop it onto the output queue.
            if (opStack.length > 0 && (functionNames.includes(opStack[opStack.length - 1]) || opStack[opStack.length - 1] === '√')) {
                output.push(opStack.pop());
            }

        } else if (PRECEDENCE[token]) {
            while (opStack.length > 0 && opStack[opStack.length - 1] !== '(' &&
                (functionNames.includes(opStack[opStack.length - 1]) ||
                    PRECEDENCE[opStack[opStack.length - 1]] >= PRECEDENCE[token])
            ) {
                // For ^ (power) we check associativity (it's right-associative usually but for calc left is fine mostly or we strictly >)
                if (token === '^' && PRECEDENCE[opStack[opStack.length - 1]] === PRECEDENCE[token]) {
                    break;
                }
                output.push(opStack.pop());
            }
            opStack.push(token);
        }
    }

    while (opStack.length > 0) {
        if (opStack[opStack.length - 1] === '(') throw new Error('Mismatched parentheses');
        output.push(opStack.pop());
    }

    return output;
}

function evaluatePostfix(postfix) {
    const stack = [];

    for (const token of postfix) {
        if (typeof token === 'number') {
            stack.push(token);
        } else if (functionNames.includes(token) || token === '√') {
            if (stack.length < 1) throw new Error('Invalid syntax');
            const a = stack.pop();
            let res;

            // Handle degree vs radian
            const rad = isDegreeMode ? a * (Math.PI / 180) : a;

            switch (token) {
                case 'sin': res = Math.sin(rad); break;
                case 'cos': res = Math.cos(rad); break;
                case 'tan':
                    // Handle tan(90) infinity issue
                    if (isDegreeMode && a % 180 === 90) throw new Error('Domain error');
                    res = Math.tan(rad);
                    break;
                case 'log': res = Math.log10(a); break;
                case 'ln': res = Math.log(a); break;
                case '√':
                    if (a < 0) throw new Error('Negative root');
                    res = Math.sqrt(a);
                    break;
            }
            stack.push(res);
        } else if (PRECEDENCE[token]) {
            if (stack.length < 2) throw new Error('Invalid syntax');
            const b = stack.pop();
            const a = stack.pop();
            let res;

            switch (token) {
                case '+': res = a + b; break;
                case '−': res = a - b; break;
                case '×': res = a * b; break;
                case '÷':
                    if (b === 0) throw new Error('Division by zero');
                    res = a / b; break;
                case '%': res = a % b; break;
                case '^': res = Math.pow(a, b); break;
            }
            stack.push(res);
        }
    }

    if (stack.length !== 1) throw new Error('Invalid syntax');
    return stack[0];
}

// --- History Management ---

function addToHistory(expr, res) {
    history.unshift({ expr, res });
    // Keep max 20 items
    if (history.length > 20) history.pop();
    saveHistory();
    renderHistory();
}

function saveHistory() {
    localStorage.setItem('calcHistory', JSON.stringify(history));
}

function renderHistory() {
    historyList.innerHTML = '';
    history.forEach(item => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="history-expr">${item.expr} =</div>
            <div class="history-result">${item.res}</div>
        `;
        el.addEventListener('click', () => {
            handleInput(item.res);
            historyPanel.classList.remove('open');
        });
        historyList.appendChild(el);
    });
}

// Boot
init();
