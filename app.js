window.__futureflowAppLoaded = true;

const API_KEY_STORAGE_KEY = 'futureflow_openai_api_key';
const WOLFRAM_APPID_STORAGE_KEY = 'futureflow_wolfram_appid';
const AI_PROVIDER_STORAGE_KEY = 'futureflow_ai_provider';

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function renderMath(target, latex) {
  target.innerHTML = latex;
  if (window.renderMathInElement) {
    window.renderMathInElement(target, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ]
    });
  }
}

function normalizeExpr(raw) {
  return raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/\^/g, '**')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/(\d+)%/g, '($1/100)');
}

function safeEval(expr, xValue = null) {
  if (!/^[\dxX+\-*/().!%*]+$/.test(expr)) throw new Error('unsupported expression');
  const compiled = xValue === null
    ? Function(`'use strict';return (${expr});`)
    : Function('x', `'use strict';return (${expr.replace(/[xX]/g, 'x')});`);
  const result = xValue === null ? compiled() : compiled(xValue);
  if (!Number.isFinite(result)) throw new Error('non-finite result');
  return result;
}

function parseLinearOrQuadratic(eqText) {
  const compact = eqText.replace(/\s+/g, '').replace(/\^/g, '**');
  if ((compact.match(/=/g) || []).length !== 1) return null;
  const [left, right] = compact.split('=');

  const f = (x) => safeEval(`(${left})-(${right})`, x);
  const f0 = f(0);
  const f1 = f(1);
  const f2 = f(2);

  const c = f0;
  const a = (f2 - (2 * f1) + f0) / 2;
  const b = f1 - a - c;
  const eps = 1e-9;

  if (Math.abs(a) < eps && Math.abs(b) < eps) {
    if (Math.abs(c) < eps) return { kind: 'identity' };
    return { kind: 'none' };
  }

  if (Math.abs(a) < eps) {
    const x = -c / b;
    return { kind: 'linear', x, a, b, c };
  }

  const d = (b * b) - (4 * a * c);
  if (d >= 0) {
    return {
      kind: 'quadratic-real',
      x1: (-b + Math.sqrt(d)) / (2 * a),
      x2: (-b - Math.sqrt(d)) / (2 * a),
      a,
      b,
      c,
      d
    };
  }
  return {
    kind: 'quadratic-complex',
    real: -b / (2 * a),
    imag: Math.sqrt(-d) / Math.abs(2 * a),
    a,
    b,
    c,
    d
  };
}

function derivativePoly(text) {
  const m = text.match(/derivative of\s*([\dxX+\-*/^ ().]+)/i);
  if (!m) return null;
  const expr = m[1].replace(/\s+/g, '');
  const terms = expr.replace(/-/g, '+-').split('+').filter(Boolean);
  const out = [];
  terms.forEach((term) => {
    const cleaned = term.replace(/\*/g, '');
    const powMatch = cleaned.match(/^([+-]?\d*\.?\d*)?[xX]\^(\d+)$/);
    const linearMatch = cleaned.match(/^([+-]?\d*\.?\d*)?[xX]$/);
    const constantMatch = cleaned.match(/^[+-]?\d*\.?\d+$/);

    if (powMatch) {
      const c = powMatch[1] === '' || powMatch[1] === '+' || powMatch[1] == null ? 1 : (powMatch[1] === '-' ? -1 : Number(powMatch[1]));
      const n = Number(powMatch[2]);
      const nc = c * n;
      const np = n - 1;
      out.push(np === 1 ? `${nc}x` : `${nc}x^${np}`);
    } else if (linearMatch) {
      const c = linearMatch[1] === '' || linearMatch[1] === '+' || linearMatch[1] == null ? 1 : (linearMatch[1] === '-' ? -1 : Number(linearMatch[1]));
      out.push(String(c));
    } else if (constantMatch) {
      out.push('0');
    } else {
      out.push('d/dx(' + cleaned + ')');
    }
  });
  return { expr, derivative: out.filter((t) => t !== '0').join(' + ').replace(/\+ -/g, '- ') || '0' };
}

function unitConvert(text) {
  const m = text.match(/([+-]?\d*\.?\d+)\s*(mph|km\/h|kmh|m\/s|ms)\s*(to|in)\s*(mph|km\/h|kmh|m\/s|ms)/i);
  if (!m) return null;
  const value = Number(m[1]);
  const from = m[2].toLowerCase().replace('km/h', 'kmh').replace('m/s', 'ms');
  const to = m[4].toLowerCase().replace('km/h', 'kmh').replace('m/s', 'ms');
  const toMs = { mph: 0.44704, kmh: 0.2777777778, ms: 1 };
  const fromMs = { mph: 2.2369362921, kmh: 3.6, ms: 1 };
  const converted = value * toMs[from] * fromMs[to];
  return { value, from, to, converted };
}

async function solveWithWolfram(problem, appId) {
  const endpoint = `https://api.wolframalpha.com/v1/result?appid=${encodeURIComponent(appId)}&i=${encodeURIComponent(problem)}`;
  const response = await fetch(endpoint, { method: 'GET' });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Wolfram error ${response.status}: ${err.slice(0, 140)}`);
  }

  const final = (await response.text()).trim();
  if (!final) throw new Error('No Wolfram result text.');

  return {
    final,
    steps: 'Wolfram|Alpha short-answer endpoint returns a concise result without full derivation steps.',
    assumptions: 'Input was interpreted using Wolfram|Alpha natural language understanding.'
  };
}

async function solveWithOpenAI(problem, apiKey, model) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: 'You are FutureFlow, a computational assistant. Return strict sections: FINAL:, STEPS:, ASSUMPTIONS:.'
          }]
        },
        { role: 'user', content: [{ type: 'input_text', text: problem }] }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${err.slice(0, 140)}`);
  }

  const data = await response.json();
  const output = (data.output_text || '').trim();
  if (!output) throw new Error('No model output text.');

  return {
    final: (output.match(/FINAL:\s*([\s\S]*?)(?:\n\s*STEPS:|$)/i)?.[1] || output).trim(),
    steps: (output.match(/STEPS:\s*([\s\S]*?)(?:\n\s*ASSUMPTIONS:|$)/i)?.[1] || 'No steps provided').trim(),
    assumptions: (output.match(/ASSUMPTIONS:\s*([\s\S]*)$/i)?.[1] || 'No assumptions listed').trim()
  };
}

async function handleSolve() {
  const input = document.getElementById('problemInput').value.trim();
  const resultArea = document.getElementById('resultArea');
  const interpretationPod = document.getElementById('interpretationPod');
  const resultPod = document.getElementById('resultPod');
  const stepsPod = document.getElementById('stepsPod');
  const assumptionsPod = document.getElementById('assumptionsPod');
  const apiKeyInput = document.getElementById('openaiApiKey');
  const wolframInput = document.getElementById('wolframAppId');
  const providerInput = document.getElementById('aiProvider');
  const rememberApiKey = document.getElementById('rememberApiKey');
  const apiKey = apiKeyInput.value.trim();
  const wolframAppId = wolframInput.value.trim();
  const aiProvider = providerInput.value;
  const model = document.getElementById('openaiModel').value.trim();
  const useOpenAI = document.getElementById('useOpenAI').checked;

  if (rememberApiKey?.checked) {
    if (apiKey) localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    if (wolframAppId) localStorage.setItem(WOLFRAM_APPID_STORAGE_KEY, wolframAppId);
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, aiProvider);
  }

  if (!input) return;

  resultArea.hidden = false;
  interpretationPod.textContent = input;

  try {
    if (useOpenAI && aiProvider === 'openai' && apiKey) {
      const ai = await solveWithOpenAI(input, apiKey, model);
      renderMath(resultPod, `$$${escapeHtml(ai.final)}$$`);
      stepsPod.innerHTML = `<pre>${escapeHtml(ai.steps)}</pre>`;
      assumptionsPod.innerHTML = `<pre>${escapeHtml(ai.assumptions)}</pre>`;
      return;
    }

    if (useOpenAI && aiProvider === 'wolfram' && wolframAppId) {
      const ai = await solveWithWolfram(input, wolframAppId);
      resultPod.textContent = ai.final;
      stepsPod.innerHTML = `<pre>${escapeHtml(ai.steps)}</pre>`;
      assumptionsPod.innerHTML = `<pre>${escapeHtml(ai.assumptions)}</pre>`;
      return;
    }

    const deriv = derivativePoly(input);
    if (deriv) {
      renderMath(resultPod, `$$\
      \\frac{d}{dx}\left(${deriv.expr.replace(/\*/g, '')}\right) = ${deriv.derivative.replace(/\*/g, '')}
      $$`);
      stepsPod.innerHTML = '<pre>Detected polynomial-like input and applied power rule term-by-term.</pre>';
      assumptionsPod.innerHTML = '<pre>Assumed variable is x and expression is differentiable term-wise.</pre>';
      return;
    }

    const conv = unitConvert(input);
    if (conv) {
      renderMath(resultPod, `$$${conv.value}\,${conv.from} = ${conv.converted.toFixed(6)}\,${conv.to}$$`);
      stepsPod.innerHTML = '<pre>Converted source unit to m/s and then to destination unit.</pre>';
      assumptionsPod.innerHTML = '<pre>Interpreted speed units with standard SI conversion factors.</pre>';
      return;
    }

    if (input.includes('=')) {
      const eq = parseLinearOrQuadratic(input);
      if (eq) {
        if (eq.kind === 'identity') {
          resultPod.textContent = 'Infinitely many solutions.';
        } else if (eq.kind === 'none') {
          resultPod.textContent = 'No solution.';
        } else if (eq.kind === 'linear') {
          renderMath(resultPod, `$$x = ${eq.x.toFixed(8)}$$`);
        } else if (eq.kind === 'quadratic-real') {
          renderMath(resultPod, `$$x_1=${eq.x1.toFixed(8)},\;x_2=${eq.x2.toFixed(8)}$$`);
        } else {
          renderMath(resultPod, `$$x=${eq.real.toFixed(8)}\pm ${eq.imag.toFixed(8)}i$$`);
        }
        stepsPod.innerHTML = '<pre>Built f(x)=LHS-RHS, estimated polynomial coefficients up to degree 2, then solved by case.</pre>';
        assumptionsPod.innerHTML = '<pre>Assumed equation is linear/quadratic in x after normalization.</pre>';
        return;
      }
    }

    const expr = normalizeExpr(input);
    const value = safeEval(expr);
    renderMath(resultPod, `$$${Number(value.toFixed(10)).toString()}$$`);
    stepsPod.innerHTML = '<pre>Parsed arithmetic expression and evaluated in strict function scope.</pre>';
    assumptionsPod.innerHTML = '<pre>Assumed pure arithmetic expression with supported operators.</pre>';
  } catch (error) {
    resultPod.textContent = 'Could not compute this input locally. Add OpenAI key or Wolfram AppID to enable AI solving.';
    stepsPod.innerHTML = `<pre>${escapeHtml(error.message)}</pre>`;
    assumptionsPod.innerHTML = '<pre>Local symbolic parser currently supports arithmetic, simple equations, polynomial derivatives, and basic speed-unit conversion.</pre>';
  }
}

function quickQuadratic() {
  const a = Number(document.getElementById('qA').value);
  const b = Number(document.getElementById('qB').value);
  const c = Number(document.getElementById('qC').value);
  const out = document.getElementById('quickQuadraticOut');
  if (![a, b, c].every(Number.isFinite) || a === 0) {
    out.textContent = 'Need finite a,b,c and a ≠ 0.';
    return;
  }
  const d = (b * b) - (4 * a * c);
  if (d >= 0) {
    const x1 = (-b + Math.sqrt(d)) / (2 * a);
    const x2 = (-b - Math.sqrt(d)) / (2 * a);
    out.textContent = `x1=${x1.toFixed(5)}, x2=${x2.toFixed(5)}`;
  } else {
    const real = -b / (2 * a);
    const imag = Math.sqrt(-d) / Math.abs(2 * a);
    out.textContent = `${real.toFixed(5)} ± ${imag.toFixed(5)}i`;
  }
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function quickNumberTheory() {
  const a = Math.trunc(Number(document.getElementById('nA').value));
  const b = Math.trunc(Number(document.getElementById('nB').value));
  const out = document.getElementById('quickNumberOut');
  if (![a, b].every(Number.isInteger) || a === 0 || b === 0) {
    out.textContent = 'Need non-zero integers.';
    return;
  }
  const g = gcd(a, b);
  const l = Math.abs((a * b) / g);
  out.textContent = `gcd=${g}, lcm=${l}`;
}

function quickConvert() {
  const value = Number(document.getElementById('uVal').value);
  const from = document.getElementById('uFrom').value;
  const to = document.getElementById('uTo').value;
  const out = document.getElementById('quickUnitOut');

  if (!Number.isFinite(value)) {
    out.textContent = 'Enter a valid number.';
    return;
  }

  const toMs = { mph: 0.44704, kmh: 0.2777777778, ms: 1 };
  const fromMs = { mph: 2.2369362921, kmh: 3.6, ms: 1 };
  const converted = value * toMs[from] * fromMs[to];
  out.textContent = `${value} ${from} = ${converted.toFixed(5)} ${to}`;
}

function clearSavedKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(WOLFRAM_APPID_STORAGE_KEY);
  localStorage.removeItem(AI_PROVIDER_STORAGE_KEY);
  const apiKeyInput = document.getElementById('openaiApiKey');
  const wolframInput = document.getElementById('wolframAppId');
  const providerInput = document.getElementById('aiProvider');
  const rememberInput = document.getElementById('rememberApiKey');
  if (apiKeyInput) apiKeyInput.value = '';
  if (wolframInput) wolframInput.value = '';
  if (providerInput) providerInput.value = 'openai';
  if (rememberInput) rememberInput.checked = false;
}

window.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('problemInput');
  const apiKeyInput = document.getElementById('openaiApiKey');
  const wolframInput = document.getElementById('wolframAppId');
  const providerInput = document.getElementById('aiProvider');
  const rememberInput = document.getElementById('rememberApiKey');
  const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  const savedWolfram = localStorage.getItem(WOLFRAM_APPID_STORAGE_KEY);
  const savedProvider = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
  if (savedKey && apiKeyInput) {
    apiKeyInput.value = savedKey;
    if (rememberInput) rememberInput.checked = true;
  }
  if (savedWolfram && wolframInput) {
    wolframInput.value = savedWolfram;
    if (rememberInput) rememberInput.checked = true;
  }
  if (savedProvider && providerInput) {
    providerInput.value = savedProvider;
  }
  input.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      handleSolve();
    }
  });
});
