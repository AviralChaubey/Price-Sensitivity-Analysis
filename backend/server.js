const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const app       = express();
const PORT      = process.env.PORT || 3000;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment.' }
});

app.use(cors());
app.use(express.json());
app.use('/api/', limiter);

// --- Input Validation ---
function validateInputs({ baseDemand, elasticity, cost, priceMin, priceMax }) {
  const errors = [];
  if (!isFinite(baseDemand) || baseDemand <= 0 || baseDemand > 1_000_000)
    errors.push('baseDemand must be between 1 and 1,000,000');
  if (!isFinite(elasticity) || elasticity >= 0 || elasticity < -10)
    errors.push('elasticity must be between -10 and -0.01');
  if (!isFinite(cost) || cost < 0 || cost > 100_000)
    errors.push('cost must be between 0 and 100,000');
  if (!isFinite(priceMin) || priceMin < 0)
    errors.push('priceMin must be >= 0');
  if (!isFinite(priceMax) || priceMax <= priceMin)
    errors.push('priceMax must be greater than priceMin');
  return errors;
}

// --- Helper Functions ---
function demandPower(baseDemand, elasticity, price, p0 = 1) {
  const safePrice = Math.max(price, 0.0001);
  return Math.max(baseDemand * Math.pow(safePrice / p0, elasticity), 0);
}

function demandLinear(baseDemand, elasticity, price, maxPrice) {
  const pr = Math.max(maxPrice / 2, 0.01);
  const Dr = demandPower(baseDemand, elasticity, pr);
  const a  = (elasticity * Dr) / pr;
  const m  = Dr - a * pr;              // ← BUG 1 FIX: m is now defined
  return Math.max(m + a * price, 0);
}

// --- API Endpoint ---
app.post('/api/analyze', (req, res) => {
  try {
    const { baseDemand, elasticity, cost, priceMin, priceMax, model } = req.body;

    const errors = validateInputs(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const D0 = Number(baseDemand);   // ← BUG 2 FIX: D0, e, c declared
    const e  = Number(elasticity);
    const c  = Number(cost);
    let pMin = Number(priceMin);
    let pMax = Number(priceMax);

    if (pMax <= pMin) pMax = pMin + 1;

    const steps = 120;
    const data  = [];

    for (let i = 0; i <= steps; i++) {
      const price  = pMin + (i / steps) * (pMax - pMin);
      const demand = model === 'linear'
        ? demandLinear(D0, e, price, pMax)
        : demandPower(D0, e, price);
      const revenue = price * demand;
      const profit  = (price - c) * demand;
      data.push({
        price:   parseFloat(price.toFixed(2)),
        demand:  parseFloat(demand.toFixed(2)),
        revenue: parseFloat(revenue.toFixed(2)),
        profit:  parseFloat(profit.toFixed(2))
      });
    }

    res.json({ data });

  } catch (error) {
    console.error("Error calculating analysis:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});