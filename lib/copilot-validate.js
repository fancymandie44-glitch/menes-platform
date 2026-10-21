'use strict';

function fail(msg) {
  const err = new Error(msg);
  err.status = 400;
  return err;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateSchema(schema, value, path = 'input') {
  if (!schema || typeof schema !== 'object') return value;
  const t = schema.type;
  if (t === 'object') {
    if (typeOf(value) !== 'object') throw fail(`${path} must be an object`);
    const props = schema.properties || {};
    if (!Object.keys(props).length) return value;
    const out = {};
    for (const key of schema.required || []) {
      if (value[key] === undefined || value[key] === null || value[key] === '') {
        throw fail(`${path}.${key} is required`);
      }
    }
    for (const [key, child] of Object.entries(props)) {
      if (value[key] === undefined) continue;
      out[key] = validateSchema(child, value[key], `${path}.${key}`);
    }
    if (schema.additionalProperties !== false) {
      for (const [key, child] of Object.entries(value)) {
        if (out[key] === undefined) out[key] = child;
      }
    }
    return out;
  }
  if (t === 'string') {
    if (typeof value !== 'string') throw fail(`${path} must be a string`);
    const s = value.slice(0, schema.maxLength || 4000);
    if (schema.minLength && s.length < schema.minLength) throw fail(`${path} is too short`);
    if (schema.enum && !schema.enum.includes(s)) throw fail(`${path} is not allowed`);
    return s;
  }
  if (t === 'number' || t === 'integer') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw fail(`${path} must be a number`);
    if (t === 'integer' && !Number.isInteger(n)) throw fail(`${path} must be an integer`);
    if (schema.minimum != null && n < schema.minimum) throw fail(`${path} is below minimum`);
    if (schema.maximum != null && n > schema.maximum) throw fail(`${path} is above maximum`);
    return n;
  }
  if (t === 'boolean') {
    if (typeof value !== 'boolean') throw fail(`${path} must be a boolean`);
    return value;
  }
  if (t === 'array') {
    if (!Array.isArray(value)) throw fail(`${path} must be an array`);
    return value.slice(0, schema.maxItems || 40).map((item, i) => (
      schema.items ? validateSchema(schema.items, item, `${path}[${i}]`) : item
    ));
  }
  return value;
}

function sanitizeStoreId(raw) {
  const id = String(raw || 'menes').trim();
  if (!/^[a-z0-9_-]{1,40}$/i.test(id)) throw fail('Invalid storeId');
  return id;
}

module.exports = { validateSchema, sanitizeStoreId };
