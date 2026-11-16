const Category = require('../models/Category');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const audit = require('./auditService');

async function list({ includeInactive = true } = {}) {
  const cats = await Category.find(includeInactive ? {} : { isActive: true }).sort({ name: 1 }).collation({ locale: 'en', strength: 2 }).lean();
  const counts = await Product.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  return cats.map((c) => ({ ...c, productCount: map.get(String(c._id)) || 0 }));
}

async function create(req, data) {
  const cat = await Category.create(data);
  await audit.record(req, { action: 'category.create', resource: 'category', resourceId: cat._id, summary: cat.name, after: cat });
  return cat;
}

async function update(req, id, data) {
  const cat = await Category.findById(id);
  if (!cat) throw ApiError.notFound('Category not found');
  const before = cat.toObject();
  Object.assign(cat, data);
  await cat.save();
  await audit.record(req, { action: 'category.update', resource: 'category', resourceId: cat._id, summary: cat.name, before, after: cat });
  return cat;
}

/** Safe deletion: refuses when any product (active or archived) still references the category. */
async function remove(req, id) {
  const cat = await Category.findById(id);
  if (!cat) throw ApiError.notFound('Category not found');
  const used = await Product.countDocuments({ category: id });
  if (used > 0) throw ApiError.conflict('Category has products. Move or archive them, or deactivate the category instead.', 'CATEGORY_IN_USE', { productCount: used });
  await cat.deleteOne();
  await audit.record(req, { action: 'category.delete', resource: 'category', resourceId: id, summary: cat.name, before: cat });
}
module.exports = { list, create, update, remove };
