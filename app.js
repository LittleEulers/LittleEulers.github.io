// FutureFlow Math Hub logic.

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

function trySimpleEval(problem) {
  const normalized = problem.trim().replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\^/g, '**');
  const safePattern = /^[\d\s+\-*/().,%!*]+$/;
  if (!safePattern.test(normalized)) return null;

  // Support very small percent convenience, e.g., 50% -> 0.5.
  const percentAdjusted = normalized.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

  // eslint-disable-next-line no-new-func
  const value = Function(`'use strict'; return (${percentAdjusted});`)();
  if (!Number.isFinite(value)) throw new Error('Result was not finite');
  return value;
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
    const simpleValue = trySimpleEval(raw);

    if (simpleValue !== null) {
      resultText = `$$\\text{Result} = ${Number(simpleValue.toFixed(10)).toString()}$$`;
      steps.innerHTML = '<ol><li>Input recognized as arithmetic expression.</li><li>Evaluated safely in a strict expression context.</li><li>Rendered as LaTeX.</li></ol>';
    } else {
      const llmResult = placeholderLLMSolve(raw);
      resultText = `$$\\text{Mode}: ${llmResult.mode}$$<br/>${llmResult.latex}`;
      steps.innerHTML = '<ol><li>Input contained non-arithmetic symbols/words.</li><li>Routed to placeholder LLM connector.</li><li>Replace <code>placeholderLLMSolve()</code> with a real API call.</li></ol>';
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
