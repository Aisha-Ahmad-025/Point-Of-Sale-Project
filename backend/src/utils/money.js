// All arithmetic is done in integer minor units (paisa/cents) to avoid floating point drift.
const toCents = (v) => Math.round(Number(v || 0) * 100);
const fromCents = (c) => Math.round(c) / 100;
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const round3 = (v) => Math.round((Number(v) + Number.EPSILON) * 1000) / 1000;
module.exports = { toCents, fromCents, round2, round3 };
