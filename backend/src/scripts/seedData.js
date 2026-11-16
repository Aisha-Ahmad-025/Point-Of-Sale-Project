/**
 * Pure dataset generator for the development seed (no database access, deterministic PRNG).
 * It SIMULATES ~45 days of trading against in-memory batches using the same FEFO allocation and
 * pricing code as the live checkout, so seeded analytics always reconcile with seeded transactions.
 */
const { allocateFefo } = require('../utils/fefo');
const { computeLine, computeTotals } = require('../utils/pricing');
const { toCents, fromCents, round3 } = require('../utils/money');

const TZ_OFFSET_H = 5; // Asia/Karachi (no DST). Local time h:m -> UTC = h - 5.
const SIM_DAYS = 45;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ean13 = (p12) => { const d = p12.split('').map(Number); const sum = d.reduce((a, n, i) => a + n * (i % 2 ? 3 : 1), 0); return p12 + ((10 - (sum % 10)) % 10); };

const CATEGORIES = [
  ['Beverages'], ['Snacks & Confectionery'], ['Dairy & Eggs'], ['Bakery'],
  ['Grocery Staples'], ['Household & Cleaning'], ['Personal Care'], ['Frozen Foods'],
];

// [name, sku, categoryIndex, unit, price, cost, reorderThreshold, avgDailyDemand, shelfLifeDays|null, extra]
const CUSTOMER_NAMES = ['Ahmed Khan', 'Bilal Hussain', 'Fatima Noor', 'Usman Tariq', 'Ayesha Siddiqui', 'Hassan Raza', 'Zainab Malik', 'Imran Sheikh', 'Sana Javed', 'Kamran Aslam', 'Maryam Yousaf', 'Tahir Mehmood'];
const P = [
  ['Mineral Water 1.5L', 'BEV-001', 0, 'pcs', 90, 62, 24, 14, null],
  ['Cola 1.5L', 'BEV-002', 0, 'pcs', 190, 140, 18, 9, null, { stopRestock: 6 }],
  ['Orange Juice 1L', 'BEV-003', 0, 'pcs', 330, 250, 10, 4, 75],
  ['Black Tea 190g', 'BEV-004', 0, 'pcs', 480, 380, 8, 3, null],
  ['Instant Coffee 50g', 'BEV-005', 0, 'pcs', 560, 430, 6, 1.2, null],
  ['Energy Drink 250ml', 'BEV-006', 0, 'pcs', 220, 160, 12, 5, null, { stopRestock: 22 }],
  ['Potato Chips 65g', 'SNK-001', 1, 'pcs', 80, 58, 24, 12, null],
  ['Milk Chocolate Bar 40g', 'SNK-002', 1, 'pcs', 120, 85, 20, 8, null],
  ['Salted Peanuts 100g', 'SNK-003', 1, 'pcs', 100, 70, 12, 4, null],
  ['Digestive Biscuits', 'SNK-004', 1, 'pcs', 140, 100, 14, 6, null],
  ['Chewing Gum', 'SNK-005', 1, 'pcs', 40, 26, 30, 7, null],
  ['Fresh Milk 1L', 'DRY-001', 2, 'pcs', 280, 235, 20, 16, 6, { stopRestock: 3 }],
  ['Yogurt 400g', 'DRY-002', 2, 'pcs', 190, 145, 12, 7, 10, { expiredLot: 5 }],
  ['Cheddar Cheese Slices 200g', 'DRY-003', 2, 'pcs', 520, 420, 6, 1.5, 45],
  ['Eggs (dozen)', 'DRY-004', 2, 'dozen', 380, 320, 8, 4, 14, { stopRestock: 5 }],
  ['Butter 200g', 'DRY-005', 2, 'pcs', 450, 370, 6, 2, 60],
  ['White Bread Loaf', 'BKR-001', 3, 'pcs', 150, 115, 10, 11, 4],
  ['Fruit Cake Slice', 'BKR-002', 3, 'pcs', 90, 60, 8, 3, 5],
  ['Naan Pack (6)', 'BKR-003', 3, 'pack', 120, 85, 6, 4, 3],
  ['Basmati Rice (loose)', 'GRC-001', 4, 'kg', 390, 330, 20, 9, null],
  ['Sugar (loose)', 'GRC-002', 4, 'kg', 150, 130, 20, 8, null],
  ['Wheat Flour 5kg', 'GRC-003', 4, 'pcs', 780, 690, 6, 2.5, null],
  ['Cooking Oil 1L', 'GRC-004', 4, 'pcs', 520, 450, 10, 4.5, null],
  ['Red Lentils 1kg', 'GRC-005', 4, 'pcs', 340, 290, 8, 2.5, null],
  ['Iodized Salt 800g', 'GRC-006', 4, 'pcs', 60, 42, 8, 2, null],
  ['Imported Olive Oil 500ml', 'GRC-007', 4, 'pcs', 1650, 1350, 4, 0.12, 300],
  ['Saffron Jar 1g', 'GRC-008', 4, 'pcs', 950, 700, 2, 0, 500],
  ['Dishwash Liquid 500ml', 'HSH-001', 5, 'pcs', 280, 210, 6, 2, null],
  ['Laundry Detergent 1kg', 'HSH-002', 5, 'pcs', 520, 430, 6, 2.2, null],
  ['Tissue Box', 'HSH-003', 5, 'pcs', 160, 110, 8, 3, null, { stopRestock: 6 }],
  ['Garbage Bags (30)', 'HSH-004', 5, 'pack', 220, 160, 6, 1, null],
  ['Shampoo 200ml', 'PCR-001', 6, 'pcs', 480, 380, 6, 1.4, null],
  ['Toothpaste 100g', 'PCR-002', 6, 'pcs', 260, 190, 8, 2.6, null],
  ['Hand Soap 125g', 'PCR-003', 6, 'pcs', 110, 75, 10, 3.5, null, { stopRestock: 5 }],
  ['Frozen Chicken Nuggets 400g', 'FRZ-001', 7, 'pcs', 690, 560, 5, 1.5, 120],
  ['Ice Cream Tub 500ml', 'FRZ-002', 7, 'pcs', 540, 420, 4, 1.2, 90],
  ['Protein Bar', 'SNK-006', 1, 'pcs', 180, 130, 10, 3, 180, { newDays: 5 }],
];

function buildDataset({ today, newId, passwordHashes, taxRate = 5, seed = 20260101 }) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const day = (offset) => new Date(today.getTime() + offset * 86400000); // UTC midnight of the local date
  const at = (offset, h, m = 0) => new Date(today.getTime() + offset * 86400000 + (h - TZ_OFFSET_H) * 3600000 + m * 60000);
  const stamp = (doc, date) => ({ ...doc, createdAt: date, updatedAt: date, __v: 0 });

  const categories = CATEGORIES.map(([name]) => ({ _id: newId(), name, isActive: true }));
  const startOffset = -(SIM_DAYS - 1);

  const products = P.map((r, i) => {
    const [name, sku, ci, unit, sellingPrice, costPrice, reorderThreshold, demand, shelf, extra = {}] = r;
    const createdOffset = extra.newDays ? -extra.newDays : -75;
    return {
      sim: { demand, shelf, ...extra, createdOffset, batches: [], lastReceipt: null },
      doc: stamp({
        _id: newId(), name, sku, barcode: ean13(`299${String(i + 1).padStart(3, '0')}${String(7000 + i * 13).padStart(6, '0')}`),
        category: categories[ci]._id, description: '', unit, sellingPrice, costPrice, reorderThreshold,
        leadTimeDays: shelf && shelf <= 10 ? 1 : 3, safetyStock: Math.ceil(demand * 1.5), taxRate: null,
        trackExpiry: shelf !== null, isActive: true,
      }, at(createdOffset, 10)),
    };
  });

  const batches = []; const movements = []; const sales = []; const counters = {};
  const cashiers = passwordHashes.cashiers; const admin = passwordHashes.admin;
  let lot = 1000;

  // ---- khata customers (fictional). `bal` is the running balance in cents, `today` the credit added so far today.
  const limits = [500000, 1000000, 1500000, 2500000, 5000000];
  const custs = CUSTOMER_NAMES.map((name, i) => ({
    bal: 0, today: 0, limitCents: limits[i % limits.length],
    doc: stamp({ _id: newId(), name, phone: `0300${String(1000001 + i * 7)}`, address: `House ${10 + i * 3}, Street ${1 + (i % 5)}, Block ${String.fromCharCode(65 + (i % 4))}`, notes: '', creditLimitCents: limits[i % limits.length], balanceCents: 0, isActive: true }, at(-80, 10)),
  }));
  const ledger = [];

  const receive = (pr, offset, qty, { reserved = 0, lotPrefix = 'LOT', shelfOverride, type = 'receipt', hour = 8 } = {}) => {
    const d = pr.doc; const shelf = shelfOverride ?? pr.sim.shelf;
    const when = at(offset, hour, 30);
    const cost = Math.round(d.costPrice * (0.97 + rnd() * 0.06) * 100) / 100;
    const b = { _id: newId(), product: d._id, lotNumber: `${lotPrefix}-${String(lot += 1)}`, receivedDate: when, expiryDate: shelf ? day(offset + shelf) : null, quantityReceived: qty, remainingQuantity: qty, costPrice: cost };
    Object.defineProperty(b, 'reserved', { value: reserved, enumerable: false, writable: true });
    batches.push(stamp(b, when)); pr.sim.batches.push(b); pr.sim.lastReceipt = offset;
    movements.push(stamp({ product: d._id, batch: b._id, lotNumber: b.lotNumber, type, quantity: qty, unitCost: cost, reason: type === 'opening' ? 'Opening stock' : 'Stock received', user: admin._id, userName: admin.name }, when));
    return b;
  };
  const sellableOf = (pr, offset) => pr.sim.batches.filter((b) => !b.expiryDate || b.expiryDate >= day(offset)).reduce((a, b) => a + Math.max(0, b.remainingQuantity - (b.reserved || 0)), 0);

  // Special lots that must survive to demonstrate expired-stock alerts
  const yogurt = products.find((p) => p.sim.expiredLot);

  for (let off = startOffset; off <= 0; off += 1) {
    const dow = day(off).getUTCDay(); // 5=Fri, 6=Sat
    const factor = (dow === 5 || dow === 6 ? 1.3 : 1) * (0.9 + (off - startOffset) / (SIM_DAYS * 8));

    // ---- restocking (08:30)
    products.forEach((pr) => {
      const s = pr.sim; const d = pr.doc;
      if (off < s.createdOffset) return;
      if (s.demand === 0 && off !== Math.max(startOffset, s.createdOffset)) return;
      const first = off === Math.max(startOffset, s.createdOffset);
      const blocked = s.stopRestock !== undefined && off > -s.stopRestock;
      if (first) {
        const q0 = Math.max(Math.ceil(s.demand * (s.shelf && s.shelf <= 14 ? 5 : 28)), d.reorderThreshold * 2, 6);
        receive(pr, off, q0, { type: 'opening' });
        return;
      }
      if (s === yogurt.sim && off === -12) receive(pr, off, 12, { reserved: 5, lotPrefix: 'YG-OLD', shelfOverride: 10 }); // expires 2 days ago, 5 units stay on shelf
      if (blocked || s.demand === 0) return;
      const stock = sellableOf(pr, off);
      const perishable = s.shelf && s.shelf <= 14;
      const cycle = perishable ? Math.max(2, Math.floor(s.shelf * 0.6)) : null;
      const need = perishable ? off - s.lastReceipt >= cycle : stock <= d.reorderThreshold + s.demand * 2;
      if (need) receive(pr, off, Math.ceil(s.demand * (perishable ? cycle * 1.25 : 21)));
    });

    // ---- write off lots that expired more than 3 days ago (recent ones stay visible as expired-stock alerts)
    products.forEach((pr) => pr.sim.batches.forEach((b) => {
      if (b.expiryDate && day(off).getTime() - b.expiryDate.getTime() > 3 * 86400000 && b.remainingQuantity > 0 && !b.reserved) {
        const q = b.remainingQuantity; b.remainingQuantity = 0;
        movements.push(stamp({ product: pr.doc._id, batch: b._id, lotNumber: b.lotNumber, type: 'wastage', quantity: -q, unitCost: b.costPrice, wastageReason: 'expired', reason: 'Expired stock written off', user: admin._id, userName: admin.name }, at(off, 9, 5)));
      }
    }));

    // ---- special events (wastage, stock count correction)
    if (off === -20) {
      const pr = products.find((p) => p.doc.sku === 'SNK-001'); const b = pr.sim.batches[0];
      b.remainingQuantity = round3(b.remainingQuantity - 6);
      movements.push(stamp({ product: pr.doc._id, batch: b._id, lotNumber: b.lotNumber, type: 'wastage', quantity: -6, unitCost: b.costPrice, wastageReason: 'damaged', reason: 'Crushed packs', user: admin._id, userName: admin.name }, at(off, 15)));
    }
    if (off === -9) {
      const pr = products.find((p) => p.doc.sku === 'BKR-001'); const b = pr.sim.batches[pr.sim.batches.length - 1];
      const w = Math.min(3, b.remainingQuantity); b.remainingQuantity = round3(b.remainingQuantity - w);
      movements.push(stamp({ product: pr.doc._id, batch: b._id, lotNumber: b.lotNumber, type: 'wastage', quantity: -w, unitCost: b.costPrice, wastageReason: 'spoiled', reason: 'Mould found', user: admin._id, userName: admin.name }, at(off, 17)));
    }
    if (off === -6) {
      const pr = products.find((p) => p.doc.sku === 'GRC-002'); const b = pr.sim.batches[0];
      const w = Math.min(2.5, b.remainingQuantity); b.remainingQuantity = round3(b.remainingQuantity - w);
      movements.push(stamp({ product: pr.doc._id, batch: b._id, lotNumber: b.lotNumber, type: 'adjustment_out', quantity: -w, unitCost: b.costPrice, reason: 'Stock count correction', user: admin._id, userName: admin.name }, at(off, 21)));
    }

    // ---- sales for the day: build lines per product, then group into carts
    const lines = [];
    products.forEach((pr) => {
      const s = pr.sim; if (off < s.createdOffset || s.demand === 0) return;
      const unitsToday = s.demand * factor * (0.7 + rnd() * 0.6);
      let left = unitsToday;
      const frac = pr.doc.unit === 'kg';
      while (left > 0.01) {
        const q = frac ? pick([0.5, 1, 1, 1.5, 2]) : pick([1, 1, 1, 1, 1, 2, 2, 3]);
        lines.push({ pr, qty: q }); left -= q;
      }
    });
    lines.sort(() => rnd() - 0.5);
    const carts = []; let guard = 0;
    while (lines.length && guard < 5000) {
      guard += 1; const size = 1 + Math.floor(rnd() * 5); const cart = [];
      for (let i = 0; i < size && lines.length; i += 1) {
        const idx = lines.findIndex((l) => !cart.some((c) => c.pr === l.pr)); if (idx < 0) break;
        cart.push(lines.splice(idx, 1)[0]);
      }
      if (cart.length) carts.push(cart);
    }
    const dayEvents = [];
    const times = carts.map(() => 9 * 60 + Math.floor(rnd() * 13 * 60)).sort((a, b) => a - b);

    carts.forEach((cart, ci) => {
      const hour = Math.floor(times[ci] / 60); const minute = times[ci] % 60; const when = at(off, hour, minute);
      const cashier = rnd() < 0.08 ? admin : pick(cashiers);
      const items = []; const mv = [];
      const saleId = newId();
      cart.forEach(({ pr, qty }) => {
        const d = pr.doc;
        const eligible = pr.sim.batches.filter((b) => (!b.expiryDate || b.expiryDate >= day(off)) && b.remainingQuantity - (b.reserved || 0) > 0)
          .map((b) => ({ _id: b._id, lotNumber: b.lotNumber, remainingQuantity: b.remainingQuantity - (b.reserved || 0), expiryDate: b.expiryDate, receivedDate: b.receivedDate, costPrice: b.costPrice, ref: b }));
        const { allocations, shortfall } = allocateFefo(eligible, qty);
        if (shortfall > 0) return; // out of stock at that time: sale simply does not happen
        const discountPercent = rnd() < 0.04 ? 5 : 0;
        const calc = computeLine({ quantity: qty, unitPrice: d.sellingPrice, discountPercent, taxRate });
        let cogsC = 0;
        allocations.forEach((a) => {
          const e = eligible.find((x) => x._id === a.batch); e.ref.remainingQuantity = round3(e.ref.remainingQuantity - a.quantity);
          cogsC += Math.round(toCents(a.costPrice) * a.quantity);
          mv.push(stamp({ product: d._id, batch: a.batch, lotNumber: a.lotNumber, type: 'sale', quantity: -a.quantity, unitCost: a.costPrice, reason: 'POS sale', user: cashier._id, userName: cashier.name, sale: saleId }, when));
        });
        items.push({ product: d._id, name: d.name, sku: d.sku, unit: d.unit, quantity: qty, unitPrice: d.sellingPrice, unitCost: fromCents(Math.round(cogsC / qty)), discountPercent, discountAmount: fromCents(calc.discount), taxRate, taxAmount: fromCents(calc.tax), lineNet: fromCents(calc.net), lineTotal: fromCents(calc.total), cogs: fromCents(cogsC), allocations, _calc: calc });
      });
      if (!items.length) return;
      const totals = computeTotals(items.map((i) => i._calc));
      const cogs = items.reduce((a, i) => a + toCents(i.cogs), 0);
      let received = Math.ceil(totals.total / 5000) * 5000; // cash handed over: round up to nearest 50
      let creditC = 0; let cust = null;
      if (rnd() < 0.09) { // some customers buy on khata (full credit, partial payment) or just have their cash sale attached
        cust = pick(custs);
        const mode = rnd();
        if (mode < 0.6) received = 0; else if (mode < 0.8) received = Math.floor((totals.total * 0.4) / 5000) * 5000;
        if (received < totals.total && mode < 0.8) {
          creditC = totals.total - received;
          if (cust.bal + cust.today + creditC > cust.limitCents) { creditC = 0; received = Math.ceil(totals.total / 5000) * 5000; } else cust.today += creditC; // limit respected
        }
      }
      const dayKey = day(off).toISOString().slice(0, 10).replace(/-/g, '');
      counters[dayKey] = (counters[dayKey] || 0) + 1;
      const sale = {
        _id: saleId, receiptNumber: `SS-${dayKey}-${String(counters[dayKey]).padStart(5, '0')}`, clientRequestId: `seed-${dayKey}-${counters[dayKey]}`,
        cashier: cashier._id, cashierName: cashier.name, items: items.map(({ _calc, ...rest }) => rest),
        subtotal: fromCents(totals.gross), discountTotal: fromCents(totals.discount), taxTotal: fromCents(totals.tax), total: fromCents(totals.total),
        netRevenue: fromCents(totals.net), cogs: fromCents(cogs), grossProfit: fromCents(totals.net - cogs),
        ...(cust ? { customer: cust.doc._id, customerName: cust.doc.name, customerPhone: cust.doc.phone } : {}),
        payment: { method: creditC > 0 ? (received > 0 ? 'partial' : 'credit') : 'cash', amountReceived: fromCents(received), change: creditC > 0 ? 0 : fromCents(received - totals.total), creditAmount: fromCents(creditC) },
        status: 'completed', paymentStatus: creditC > 0 ? (received > 0 ? 'partial' : 'unpaid') : 'paid',
      };
      movements.push(...mv);
      const stamped = stamp(sale, when);
      sales.push(stamped);
      if (cust) dayEvents.push({ time: when, kind: 'sale', cust, creditC, sale: stamped });
    });

    // ---- customers pay back part of their khata during the day; one old small balance is written off
    custs.forEach((c, i) => {
      if (rnd() < 0.2) dayEvents.push({ time: at(off, 10 + Math.floor(rnd() * 11), Math.floor(rnd() * 60)), kind: 'payment', cust: c, user: pick(cashiers) });
      if (off === -10 && i === 3) dayEvents.push({ time: at(off, 20, 15), kind: 'adjust', cust: c });
    });
    dayEvents.sort((a, b) => a.time - b.time).forEach((ev) => {
      const c = ev.cust;
      if (ev.kind === 'sale') {
        if (ev.creditC > 0) { c.bal += ev.creditC; ledger.push(stamp({ _id: newId(), customer: c.doc._id, type: 'charge', amount: fromCents(ev.creditC), balanceAfter: fromCents(c.bal), sale: ev.sale._id, receiptNumber: ev.sale.receiptNumber, note: `Sale ${ev.sale.receiptNumber}`, user: ev.sale.cashier, userName: ev.sale.cashierName }, ev.time)); }
        ev.sale.customerBalanceAfter = fromCents(c.bal);
      } else if (ev.kind === 'payment' && c.bal > 0) {
        const part = rnd() < 0.5 ? c.bal : Math.max(5000, Math.floor((c.bal * (0.3 + rnd() * 0.5)) / 5000) * 5000);
        const pay = Math.min(c.bal, part); c.bal -= pay; c.doc.lastPaymentAt = ev.time;
        ledger.push(stamp({ _id: newId(), customer: c.doc._id, type: 'payment', amount: fromCents(-pay), balanceAfter: fromCents(c.bal), note: 'Payment received', user: ev.user._id, userName: ev.user.name }, ev.time));
      } else if (ev.kind === 'adjust' && c.bal >= 20000) {
        c.bal -= 15000;
        ledger.push(stamp({ _id: newId(), customer: c.doc._id, type: 'adjustment', amount: fromCents(-15000), balanceAfter: fromCents(c.bal), note: 'Write-off of old small balance', user: admin._id, userName: admin.name }, ev.time));
      }
    });
    custs.forEach((c) => { c.today = 0; });
  }

  const byId = new Map(products.flatMap((p) => p.sim.batches).map((b) => [String(b._id), b]));
  // Void two historic sales (admin) so refunds/voids show up in history and reports exclude them.
  [Math.floor(sales.length * 0.3), Math.floor(sales.length * 0.62)].forEach((idx) => {
    let i = idx; while (sales[i].payment.creditAmount > 0) i += 1; // keep voids simple: only sales without credit
    const s = sales[i]; const when = new Date(s.createdAt.getTime() + 25 * 60000);
    s.status = 'voided'; s.paymentStatus = 'refunded'; s.voidedAt = when; s.voidedBy = admin._id; s.voidReason = 'Customer returned items';
    s.items.forEach((it) => it.allocations.forEach((a) => {
      const b = byId.get(String(a.batch)); b.remainingQuantity = round3(b.remainingQuantity + a.quantity);
      movements.push(stamp({ product: it.product, batch: a.batch, lotNumber: a.lotNumber, type: 'void_return', quantity: a.quantity, unitCost: a.costPrice, reason: `Void ${s.receiptNumber}: Customer returned items`, user: admin._id, userName: admin.name, sale: s._id }, when));
    }));
  });

  // Sim batch objects are the same references stored in `batches` (stamp copies), so sync remaining back.
  batches.forEach((b) => { const live = byId.get(String(b._id)); if (live) b.remainingQuantity = live.remainingQuantity; });

  const customers = custs.map((c) => ({ ...c.doc, balanceCents: c.bal }));
  return { categories, products: products.map((p) => p.doc), batches, movements, sales, customers, ledger };
}

/** Verifies that for every batch: quantityReceived/opening/receipt + all movements == remainingQuantity. */
function reconcile({ batches, movements, customers = [], ledger = [] }) {
  const sums = new Map();
  movements.forEach((m) => sums.set(String(m.batch), (sums.get(String(m.batch)) || 0) + m.quantity));
  const bad = batches.filter((b) => Math.abs((sums.get(String(b._id)) || 0) - b.remainingQuantity) > 0.0005 || b.remainingQuantity < -1e-9);
  // khata: the sum of a customer's ledger entries must equal their stored balance, and balanceAfter must follow the running total
  const run = new Map(); let badLedger = 0;
  [...ledger].sort((a, b) => a.createdAt - b.createdAt).forEach((e) => {
    const next = (run.get(String(e.customer)) || 0) + toCents(e.amount); run.set(String(e.customer), next);
    if (toCents(e.balanceAfter) !== next) badLedger += 1;
  });
  const badCustomers = customers.filter((c) => (run.get(String(c._id)) || 0) !== c.balanceCents || c.balanceCents < 0 || c.balanceCents > c.creditLimitCents);
  return { ok: bad.length === 0 && badLedger === 0 && badCustomers.length === 0, mismatches: bad.length, ledgerMismatches: badLedger, customerMismatches: badCustomers.length };
}

module.exports = { buildDataset, reconcile, SIM_DAYS };
