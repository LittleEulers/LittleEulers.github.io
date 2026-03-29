const queryInput = document.getElementById("query");
const computeBtn = document.getElementById("computeBtn");
const inputInterpretation = document.getElementById("inputInterpretation");
const resultText = document.getElementById("resultText");
const stepsText = document.getElementById("stepsText");
const quickButtons = document.querySelectorAll(".quick");
const keyboardContainer = document.getElementById("mathKeyboard");

const keys = [
  "7",
  "8",
  "9",
  "+",
  "4",
  "5",
  "6",
  "-",
  "1",
  "2",
  "3",
  "*",
  "0",
  ".",
  "(",
  ")",
  "π",
  "e",
  "^",
  "/",
  "sqrt(",
  "sin(",
  "cos(",
  "tan(",
  "log(",
  "ln(",
  "abs(",
  "x",
  "=",
  "integral ",
  "derivative ",
  "solve "
];

keys.forEach((k) => {
  const btn = document.createElement("button");
  btn.className = "key";
  btn.textContent = k;
  btn.addEventListener("click", () => {
    queryInput.value += k;
    queryInput.focus();
  });
  keyboardContainer.appendChild(btn);
});

quickButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    queryInput.value = btn.dataset.query;
    runQuery();
  });
});

computeBtn.addEventListener("click", runQuery);
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runQuery();
});

function normalizeExpr(expr) {
  return expr
    .replaceAll("π", "pi")
    .replace(/\bln\(/gi, "log(")
    .replace(/\^/g, "**")
    .replace(/\bpi\b/gi, `(${Math.PI})`)
    .replace(/\be\b/g, `(${Math.E})`)
    .replace(/\bsqrt\(/gi, "Math.sqrt(")
    .replace(/\bsin\(/gi, "Math.sin(")
    .replace(/\bcos\(/gi, "Math.cos(")
    .replace(/\btan\(/gi, "Math.tan(")
    .replace(/\blog\(/gi, "Math.log10(")
    .replace(/\babs\(/gi, "Math.abs(");
}

function safeEval(expr, xVal = null) {
  const prepared = normalizeExpr(expr);
  const withX = xVal === null ? prepared : prepared.replace(/\bx\b/g, `(${xVal})`);
  if (/[^0-9+\-*/().,\sA-Za-z_]/.test(withX)) {
    throw new Error("Unsupported characters.");
  }
  return Function(`"use strict"; return (${withX});`)();
}

function formatNum(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) < 1e-12) return "0";
  return Number(n.toFixed(10)).toString();
}

function derivePower(expr) {
  const cleaned = expr.replace(/\s+/g, "");
  const poly = cleaned.match(/^([+-]?\d*\.?\d*)?x\^(\d+)$/i);
  if (poly) {
    const c = poly[1] === "" || poly[1] === "+" || poly[1] === undefined ? 1 : poly[1] === "-" ? -1 : Number(poly[1]);
    const p = Number(poly[2]);
    return `${formatNum(c * p)}x^${p - 1}`;
  }
  const linear = cleaned.match(/^([+-]?\d*\.?\d*)?x$/i);
  if (linear) {
    const c = linear[1] === "" || linear[1] === "+" || linear[1] === undefined ? 1 : linear[1] === "-" ? -1 : Number(linear[1]);
    return formatNum(c);
  }
  if (/^sin\(x\)$/i.test(cleaned)) return "cos(x)";
  if (/^cos\(x\)$/i.test(cleaned)) return "-sin(x)";
  if (/^tan\(x\)$/i.test(cleaned)) return "sec(x)^2";
  return null;
}

function numericDerivative(expr, x = 1) {
  const h = 1e-5;
  const fp = safeEval(expr, x + h);
  const fm = safeEval(expr, x - h);
  return (fp - fm) / (2 * h);
}

function numericIntegral(expr, a, b, n = 500) {
  if (n % 2 !== 0) n += 1;
  const h = (b - a) / n;
  let sum = safeEval(expr, a) + safeEval(expr, b);
  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    sum += safeEval(expr, x) * (i % 2 === 0 ? 2 : 4);
  }
  return (sum * h) / 3;
}

function solvePolynomial(expr) {
  const normalized = expr.replace(/\s+/g, "").replace(/=0$/, "");
  const quad = normalized.match(/^([+-]?\d*\.?\d*)x\^2([+-]\d*\.?\d*)x([+-]\d*\.?\d*)$/i);
  if (quad) {
    const a = Number(quad[1] || 1);
    const b = Number(quad[2]);
    const c = Number(quad[3]);
    const d = b * b - 4 * a * c;
    if (d < 0) return { result: "Complex roots", details: `Discriminant = ${formatNum(d)} < 0` };
    const r1 = (-b + Math.sqrt(d)) / (2 * a);
    const r2 = (-b - Math.sqrt(d)) / (2 * a);
    return { result: `x = ${formatNum(r1)}, ${formatNum(r2)}`, details: `a=${a}, b=${b}, c=${c}, discriminant=${formatNum(d)}` };
  }

  const linear = normalized.match(/^([+-]?\d*\.?\d*)x([+-]\d*\.?\d*)$/i);
  if (linear) {
    const a = Number(linear[1] || 1);
    const b = Number(linear[2]);
    const x = -b / a;
    return { result: `x = ${formatNum(x)}`, details: `ax+b=0 with a=${a}, b=${b}` };
  }
  return null;
}

function factorSimple(expr) {
  const cleaned = expr.replace(/\s+/g, "");
  const quad = cleaned.match(/^x\^2([+-]\d+)x([+-]\d+)$/i);
  if (!quad) return null;
  const b = Number(quad[1]);
  const c = Number(quad[2]);
  for (let m = -Math.abs(c); m <= Math.abs(c); m++) {
    if (m === 0 || c % m !== 0) continue;
    const n = c / m;
    if (m + n === b) {
      const f1 = m >= 0 ? `x+${m}` : `x${m}`;
      const f2 = n >= 0 ? `x+${n}` : `x${n}`;
      return `(${f1})(${f2})`;
    }
  }
  return null;
}

function runQuery() {
  const raw = queryInput.value.trim();
  if (!raw) return;
  const q = raw.toLowerCase();

  inputInterpretation.textContent = raw;
  resultText.textContent = "Computing...";
  stepsText.textContent = "";

  try {
    if (q.startsWith("solve ")) {
      const expr = raw.slice(6).trim();
      const solved = solvePolynomial(expr);
      if (solved) {
        resultText.textContent = solved.result;
        stepsText.textContent = solved.details;
      } else {
        resultText.textContent = "Could not parse equation. Try forms like x^2-5x+6=0";
        stepsText.textContent = "Supported: linear/quadratic in x.";
      }
      return;
    }

    if (q.startsWith("derivative ")) {
      const expr = raw.slice("derivative ".length).trim();
      const symbolic = derivePower(expr);
      if (symbolic) {
        resultText.textContent = `d/dx ${expr} = ${symbolic}`;
        stepsText.textContent = "Applied symbolic rule for power/trig function.";
      } else {
        const at1 = numericDerivative(expr, 1);
        resultText.textContent = `Numeric derivative near x=1: ${formatNum(at1)}`;
        stepsText.textContent = "Used centered finite-difference: (f(x+h)-f(x-h))/(2h).";
      }
      return;
    }

    if (q.startsWith("integral ")) {
      const m = raw.match(/integral\s+(.+)\s+to\s+(.+)\s+of\s+(.+)/i);
      if (!m) {
        resultText.textContent = "Format: integral a to b of expression_in_x";
        stepsText.textContent = "Example: integral 0 to 2 of x^2";
        return;
      }
      const a = Number(safeEval(m[1]));
      const b = Number(safeEval(m[2]));
      const expr = m[3];
      const val = numericIntegral(expr, a, b);
      resultText.textContent = `∫(${a}→${b}) ${expr} dx ≈ ${formatNum(val)}`;
      stepsText.textContent = "Computed using Simpson's Rule (n=500).";
      return;
    }

    if (q.startsWith("factor ")) {
      const expr = raw.slice(7).trim();
      const factored = factorSimple(expr);
      if (factored) {
        resultText.textContent = `${expr} = ${factored}`;
        stepsText.textContent = "Integer factor search for monic quadratic.";
      } else {
        resultText.textContent = "Could not factor with current rules.";
        stepsText.textContent = "Supported: x^2+bx+c with integer roots.";
      }
      return;
    }

    const val = safeEval(raw);
    resultText.textContent = formatNum(val);
    stepsText.textContent = "Direct numeric evaluation with built-in parser.";
  } catch (err) {
    resultText.textContent = `Error: ${err.message}`;
    stepsText.textContent = "Try expressions like 2+2, sin(1), solve x^2-5x+6=0, derivative x^3.";
  }
}

// Calculator widget
const calcDisplay = document.getElementById("calcDisplay");
const calcGrid = document.getElementById("calcGrid");
const calcButtons = [
  "7",
  "8",
  "9",
  "/",
  "4",
  "5",
  "6",
  "*",
  "1",
  "2",
  "3",
  "-",
  "0",
  ".",
  "=",
  "+",
  "C",
  "(",
  ")",
  "ANS"
];
let calcExpr = "";
let calcAns = "0";

calcButtons.forEach((b) => {
  const btn = document.createElement("button");
  btn.className = `calc-btn ${["=", "C", "ANS"].includes(b) ? "primary" : ""}`;
  btn.textContent = b;
  btn.addEventListener("click", () => onCalcPress(b));
  calcGrid.appendChild(btn);
});

function onCalcPress(key) {
  if (key === "C") {
    calcExpr = "";
    calcDisplay.textContent = "0";
    return;
  }
  if (key === "ANS") {
    calcExpr += calcAns;
    calcDisplay.textContent = calcExpr;
    return;
  }
  if (key === "=") {
    try {
      const val = safeEval(calcExpr || "0");
      calcAns = formatNum(val);
      calcExpr = calcAns;
      calcDisplay.textContent = calcAns;
    } catch {
      calcDisplay.textContent = "Error";
      calcExpr = "";
    }
    return;
  }
  calcExpr += key;
  calcDisplay.textContent = calcExpr;
}
