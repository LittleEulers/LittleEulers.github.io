// FutureFlow Math Hub logic.
window.__futureflowAppLoaded = true;

const toolState = {
  tri: 'area',
  nt: 'prime'
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
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

function toggleMenu() {
  document.getElementById('mobileNav').classList.toggle('open');
}

function toggleTool(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle('open');
  const expanded = card.classList.contains('open');
  card.querySelector('.tool-header')?.setAttribute('aria-expanded', String(expanded));
}

function switchTab(group, tabKey, button) {
  toolState[group] = tabKey;
  const card = button.closest('.tool-card');
  card.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
  button.classList.add('active');
  card.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
  card.querySelector(`#${group}-${tabKey}`)?.classList.add('active');
}

function placeholderLLMSolve(problem) {
  return {
    mode: 'llm-placeholder',
    latex: `I parsed this as a word/problem-solving query:\\[4pt]\\texttt{${problem.replace(/\\/g, '\\\\').replace(/_/g, '\\_')}}\\[4pt]Connect this function to Gemini/OpenAI for step-by-step reasoning.`
  };
}

async function solveWithOpenAI(problem, apiKey, model) {
  const instructions = [
    'You are a math tutor.',
    'Solve the user problem clearly.',
    'Return concise output with two sections using plain text:',
    'FINAL_ANSWER: (single line result)',
    'STEPS: (short numbered steps, may include LaTeX wrapped with $...$ or $$...$$).'
  ].join(' ');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4.1-mini',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: instructions }] },
        { role: 'user', content: [{ type: 'input_text', text: problem }] }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText.slice(0, 180)}`);
  }

  const data = await response.json();
  const text = (data.output_text || '').trim();
  if (!text) throw new Error('OpenAI response did not include output_text.');

  const finalMatch = text.match(/FINAL_ANSWER:\\s*([\\s\\S]*?)(?:\\nSTEPS:|$)/i);
  const stepsMatch = text.match(/STEPS:\\s*([\\s\\S]*)$/i);
  const finalAnswer = (finalMatch?.[1] || text).trim();
  const stepText = (stepsMatch?.[1] || 'No steps provided by model.').trim();

  return { finalAnswer, stepText, raw: text };
}

function cleanArithmeticExpression(problem) {
  return problem
    .trim()
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/[?]/g, '')
    .replace(/=\s*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\^/g, '**');
}

function trySimpleEval(problem) {
  const normalized = cleanArithmeticExpression(problem);
  const safePattern = /^[\d\s+\-*/().,%!*]+$/;
  if (!safePattern.test(normalized)) return null;

  // Support very small percent convenience, e.g., 50% -> 0.5.
  const percentAdjusted = normalized.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

  // eslint-disable-next-line no-new-func
  const value = Function(`'use strict'; return (${percentAdjusted});`)();
  if (!Number.isFinite(value)) throw new Error('Result was not finite');
  return value;
}

function trySolveEquation(problem) {
  const normalizedProblem = problem
    .trim()
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');

  const embedded = normalizedProblem.match(/([0-9xX+\-*/().^\s]+=[0-9xX+\-*/().^\s]+)/);
  const raw = (embedded ? embedded[1] : normalizedProblem).replace(/\s+/g, '');
  if (!raw.includes('=') || (raw.match(/=/g) || []).length !== 1) return null;
  if (!/^[0-9xX+\-*/().=^]+$/.test(raw)) return null;

  const [leftRaw, rightRaw] = raw.split('=');
  if (!leftRaw || !rightRaw) return null;

  const normalizeSide = (side) => side
    .replace(/\^/g, '**')
    .replace(/(\d)([xX])/g, '$1*$2')
    .replace(/([xX])(\d)/g, '$1*$2')
    .replace(/([xX])\(/g, '$1*(')
    .replace(/\)([xX\d])/g, ')*$1');

  const left = normalizeSide(leftRaw);
  const right = normalizeSide(rightRaw);

  const safePattern = /^[0-9xX+\-*/().]+$/;
  if (!safePattern.test(left) || !safePattern.test(right)) return null;

  // eslint-disable-next-line no-new-func
  const fn = Function('x', `'use strict'; return ((${left}) - (${right}));`);
  const f0 = Number(fn(0));
  const f1 = Number(fn(1));
  const f2 = Number(fn(2));

  if (![f0, f1, f2].every(Number.isFinite)) return null;

  const c = f0;
  const a = (f2 - (2 * f1) + f0) / 2;
  const b = f1 - a - c;
  const eps = 1e-9;

  if (Math.abs(a) < eps && Math.abs(b) < eps) {
    if (Math.abs(c) < eps) {
      return { type: 'identity', latex: '$$\\text{Infinitely many solutions}$$' };
    }
    return { type: 'contradiction', latex: '$$\\text{No solution}$$' };
  }

  if (Math.abs(a) < eps) {
    const x = -c / b;
    return {
      type: 'linear',
      latex: `$$${b.toFixed(6)}x + ${c.toFixed(6)} = 0$$ $$x = ${x.toFixed(6)}$$`
    };
  }

  const d = (b * b) - (4 * a * c);
  if (d >= 0) {
    const x1 = (-b + Math.sqrt(d)) / (2 * a);
    const x2 = (-b - Math.sqrt(d)) / (2 * a);
    return {
      type: 'quadratic-real',
      latex: `$$x = \\frac{-(${b.toFixed(6)}) \\pm \\sqrt{${d.toFixed(6)}}}{${(2 * a).toFixed(6)}}$$ $$x_1=${x1.toFixed(6)},\\;x_2=${x2.toFixed(6)}$$`
    };
  }

  const real = -b / (2 * a);
  const imag = Math.sqrt(-d) / Math.abs(2 * a);
  return {
    type: 'quadratic-complex',
    latex: `$$x = ${real.toFixed(6)} \\pm ${imag.toFixed(6)}i$$`
  };
}

async function handleSolve() {
  const inputEl = document.getElementById('problemInput');
  const outputPanel = document.getElementById('solverResult');
  const body = document.getElementById('resultBody');
  const steps = document.getElementById('resultSteps');
  const overlay = document.getElementById('thinkOverlay');
  const progress = document.getElementById('thinkProgress');
  const msg = document.getElementById('thinkMsg');

  const raw = inputEl.value.trim();
  const apiKey = document.getElementById('openaiApiKey')?.value?.trim() || '';
  const model = document.getElementById('openaiModel')?.value?.trim() || 'gpt-4.1-mini';
  const useOpenAI = document.getElementById('useOpenAI')?.checked;
  if (!raw) {
    body.textContent = 'Please enter a problem first.';
    steps.textContent = '';
    outputPanel.hidden = false;
    return;
  }

  overlay.hidden = false;
  const phases = ['Tokenizing input…', 'Detecting problem type…', 'Computing result…', 'Formatting LaTeX output…'];

  for (let i = 0; i < phases.length; i += 1) {
    msg.textContent = phases[i];
    progress.style.width = `${((i + 1) / phases.length) * 100}%`;
    // Simulated "thinking" animation for a mock frontend.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 320));
  }

  try {
    let resultText = '';
    if (useOpenAI && apiKey) {
      const aiResult = await solveWithOpenAI(raw, apiKey, model);
      resultText = `$$\\text{AI Result}$$<br/>${aiResult.finalAnswer}`;
      steps.innerHTML = `<pre>${aiResult.stepText.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>`;
    } else {
      const simpleValue = trySimpleEval(raw);
      const equationResult = simpleValue === null ? trySolveEquation(raw) : null;

      if (simpleValue !== null) {
        resultText = `$$\\text{Result} = ${Number(simpleValue.toFixed(10)).toString()}$$`;
        steps.innerHTML = '<ol><li>Input recognized as arithmetic expression.</li><li>Evaluated safely in a strict expression context.</li><li>Rendered as LaTeX.</li></ol>';
      } else if (equationResult) {
        resultText = equationResult.latex;
        steps.innerHTML = '<ol><li>Input recognized as an equation in <code>x</code>.</li><li>Polynomial coefficients estimated (up to degree 2).</li><li>Solution rendered in LaTeX.</li></ol>';
      } else {
        const llmResult = placeholderLLMSolve(raw);
        resultText = `$$\\text{Mode}: ${llmResult.mode}$$<br/>${llmResult.latex}`;
        steps.innerHTML = '<ol><li>Input contained non-arithmetic symbols/words.</li><li>No API key was provided, so local fallback was used.</li><li>Add key to use OpenAI for full natural-language solving.</li></ol>';
      }
    }

    renderMath(body, resultText);
    outputPanel.hidden = false;
  } catch (error) {
    renderMath(body, `$$\\text{Error: could not solve this input.}$$`);
    steps.textContent = `Details: ${error.message}`;
    outputPanel.hidden = false;
  } finally {
    setTimeout(() => {
      overlay.hidden = true;
      progress.style.width = '0%';
    }, 180);
  }
}

function copyOutput() {
  const text = document.getElementById('resultBody').innerText.trim();
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {
    // Clipboard may fail in some contexts; ignore gracefully.
  });
}

function solveQuadratic() {
  const a = safeNumber(document.getElementById('q-a').value);
  const b = safeNumber(document.getElementById('q-b').value);
  const c = safeNumber(document.getElementById('q-c').value);
  const out = document.getElementById('quadratic-result');

  if ([a, b, c].some((v) => Number.isNaN(v))) {
    out.textContent = 'Enter valid numeric values for a, b, c.';
    return;
  }
  if (a === 0) {
    out.textContent = 'Coefficient a cannot be 0 for a quadratic equation.';
    return;
  }

  const d = b * b - 4 * a * c;
  const twoA = 2 * a;

  if (d >= 0) {
    const x1 = (-b + Math.sqrt(d)) / twoA;
    const x2 = (-b - Math.sqrt(d)) / twoA;
    renderMath(out, `$$x = \\frac{-(${b}) \\pm \\sqrt{${d}}}{${twoA}}$$ $$x_1=${x1.toFixed(6)},\\;x_2=${x2.toFixed(6)}$$`);
  } else {
    const real = (-b / twoA).toFixed(6);
    const imag = (Math.sqrt(-d) / Math.abs(twoA)).toFixed(6);
    renderMath(out, `$$x = ${real} \\pm ${imag}i$$`);
  }
}

function solveTriangle() {
  const out = document.getElementById('triangle-result');

  if (toolState.tri === 'area') {
    const base = safeNumber(document.getElementById('tri-base').value);
    const height = safeNumber(document.getElementById('tri-height').value);
    if ([base, height].some((v) => Number.isNaN(v) || v <= 0)) {
      out.textContent = 'Base and height must both be positive numbers.';
      return;
    }

    const area = (base * height) / 2;
    renderMath(out, `$$A = \\frac{1}{2}bh = \\frac{1}{2}(${base})(${height}) = ${area}$$`);
    return;
  }

  const a = safeNumber(document.getElementById('tri-a').value);
  const b = safeNumber(document.getElementById('tri-b').value);
  if ([a, b].some((v) => Number.isNaN(v) || v <= 0)) {
    out.textContent = 'Leg values must both be positive numbers.';
    return;
  }

  const c = Math.hypot(a, b);
  renderMath(out, `$$c = \\sqrt{a^2+b^2} = \\sqrt{${a}^2 + ${b}^2} = ${c.toFixed(6)}$$`);
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

function primeFactorization(n) {
  const factors = [];
  let num = n;

  while (num % 2 === 0) {
    factors.push(2);
    num /= 2;
  }
  for (let p = 3; p * p <= num; p += 2) {
    while (num % p === 0) {
      factors.push(p);
      num /= p;
    }
  }
  if (num > 1) factors.push(num);

  return factors;
}

function factorsToLatex(factors) {
  if (factors.length === 0) return '1';
  const counts = new Map();
  factors.forEach((f) => counts.set(f, (counts.get(f) || 0) + 1));
  return [...counts.entries()]
    .map(([prime, exp]) => (exp === 1 ? `${prime}` : `${prime}^{${exp}}`))
    .join(' \\cdot ');
}

function solveNumberTheory() {
  const out = document.getElementById('numtheory-result');

  if (toolState.nt === 'prime') {
    const n = Math.trunc(safeNumber(document.getElementById('nt-n').value));
    if (!Number.isInteger(n) || n < 2) {
      out.textContent = 'n must be an integer greater than or equal to 2.';
      return;
    }

    const factors = primeFactorization(n);
    const latex = factorsToLatex(factors);
    renderMath(out, `$$${n} = ${latex}$$`);
    return;
  }

  const a = Math.trunc(safeNumber(document.getElementById('nt-a').value));
  const b = Math.trunc(safeNumber(document.getElementById('nt-b').value));

  if (![a, b].every(Number.isInteger) || a === 0 || b === 0) {
    out.textContent = 'a and b must be non-zero integers.';
    return;
  }

  const g = gcd(a, b);
  const l = Math.abs((a * b) / g);
  renderMath(out, `$$\\gcd(${a},${b})=${g},\\quad\\mathrm{lcm}(${a},${b})=${l}$$`);
}

function updateProgressBar() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  document.getElementById('progressBar').style.width = `${progress}%`;
}

function animateStats() {
  const cards = document.querySelectorAll('.stat-num[data-count]');
  cards.forEach((card) => {
    const target = Number(card.dataset.count);
    const start = performance.now();
    const duration = 1100;

    const step = (t) => {
      const progress = Math.min((t - start) / duration, 1);
      card.textContent = Math.round(target * progress).toString();
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  });
}

function initCursorGlow() {
  const glow = document.getElementById('cursorGlow');
  window.addEventListener('pointermove', (e) => {
    glow.style.opacity = '1';
    glow.style.transform = `translate(${e.clientX - 140}px, ${e.clientY - 140}px)`;
  });
}

function initKeyboardSolve() {
  const input = document.getElementById('problemInput');
  input.addEventListener('keydown', (event) => {
    const isCmdEnter = (event.metaKey || event.ctrlKey) && event.key === 'Enter';
    if (isCmdEnter) handleSolve();
  });
}

window.addEventListener('scroll', updateProgressBar);
window.addEventListener('DOMContentLoaded', () => {
  // Open first tool by default for faster usage.
  toggleTool('toolQuadratic');
  animateStats();
  initCursorGlow();
  initKeyboardSolve();
});
