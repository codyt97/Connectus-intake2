// /api/ordertime/_ot.js
const OT_BASE = 'https://services.ordertime.com/api';

function otHeaders() {
  const { OT_API_KEY, OT_EMAIL, OT_PASSWORD, OT_DEVKEY } = process.env;
  const h = { 'Content-Type': 'application/json', apiKey: OT_API_KEY, email: OT_EMAIL };
  if (OT_DEVKEY) h.DevKey = OT_DEVKEY; else h.password = OT_PASSWORD;
  return h;
}

/* ---- small in-memory cache ---- */
const cache = new Map();
const put = (k,v,ms=5*60*1000)=>cache.set(k,{v,exp:Date.now()+ms});
const get = (k)=>{ const e=cache.get(k); if(!e||Date.now()>e.exp) return null; return e.v; };

/* ---- enums: resolve RecordType by name once ---- */
async function getRecordType(typeName) {
  const key = `recordtype:${typeName}`;
  const hit = get(key); if (hit) return hit;

  // Pull the full RecordType enum map once and reverse-index it
  let map = get('recordtype:map');
  if (!map) {
    const res = await fetch(`${OT_BASE}/enums/RecordTypeEnum`, { headers: otHeaders() });
    if (!res.ok) throw new Error(`/enums/RecordTypeEnum ${res.status}`);
    const json = await res.json();           // { "1":"...", "2":"...", ... }
    // build reverse { "Customer": 120, "Item": 100, "SalesOrder": 7, ... }
    map = Object.fromEntries(Object.entries(json).map(([code,name]) => [name, Number(code)]));
    put('recordtype:map', map, 12*60*60*1000); // 12h
  }
  const code = map[typeName];
  if (!code) throw new Error(`RecordTypeEnum missing: ${typeName}`);
  put(key, code);
  return code;
}

/* ---- generic LIST helper ---- */
async function otList(listInfo) {
  const res = await fetch(`${OT_BASE}/list`, {
    method: 'POST',
    headers: otHeaders(),
    body: JSON.stringify(listInfo),
  });
  if (!res.ok) throw new Error(`/list failed ${res.status} ${await res.text().catch(()=> '')}`);
  return res.json();
}

/* ---- entity GET by id ---- */
async function otGetEntity(path, id) {
  const url = `${OT_BASE}/${path}?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: otHeaders() });
  if (!res.ok) throw new Error(`GET ${path} failed ${res.status}`);
  return res.json();
}

/* ================== SPECIFIC QUERIES ================== */

// 1) Customers (entity: Customer)
export async function searchCustomersByName(q, page=1, take=25) {
  const Type = await getRecordType('Customer');
  return otList({
    Type,
    Filters: [{ PropertyName: 'Name', Operator: 12, FilterValueArray: q }],
    PageNumber: page, NumberOfRecords: take,
    Sortation: { PropertyName: 'Name' },
  });
}
export async function getCustomerById(id) { return otGetEntity('customer', id); }

// CustomerAddresses for a given Customer
export async function listCustomerAddresses(customerId, page=1, take=50) {
  const Type = await getRecordType('CustomerAddress');
  return otList({
    Type,
    Filters: [{ PropertyName: 'CustomerRef.Id', Operator: 1, FilterValueArray: String(customerId) }],
    PageNumber: page, NumberOfRecords: take,
    Sortation: { PropertyName: 'IsDefault', Direction: 2 },
  });
}

// 2) Items = Parts + NonPart (two list calls, then merge)
export async function searchItemsByText(q, page=1, take=25) {
  const [PartType, NonPartType] = await Promise.all([
    getRecordType('Part'), getRecordType('NonPart')
  ]);
  const makeList = (Type)=> otList({
    Type,
    Filters: [{
      // try name OR item number: run two LIKE filters in two calls if you want
      PropertyName: 'Name',
      Operator: 12,
      FilterValueArray: q
    }],
    PageNumber: page, NumberOfRecords: take,
    Sortation: { PropertyName: 'Name' },
  });
  const [parts, nonparts] = await Promise.all([makeList(PartType), makeList(NonPartType)]);
  return [...parts, ...nonparts]; // caller can slice if needed
}
export async function getPartById(id){ return otGetEntity('parts', id); }
export async function getNonPartById(id){ return otGetEntity('nonpart', id); }

// 3) Sales Orders (search by DocNo or Customer name)
export async function searchSalesOrders({ q, customer, page=1, take=25 }) {
  const Type = await getRecordType('SalesOrder');
  const filters = [];
  if (q) filters.push({ PropertyName: 'DocNo', Operator: 12, FilterValueArray: q });
  if (customer) filters.push({ PropertyName: 'CustomerRef.Name', Operator: 12, FilterValueArray: customer });
  return otList({
    Type, Filters: filters.length?filters:undefined,
    PageNumber: page, NumberOfRecords: take,
    Sortation: { PropertyName: 'DocNo', Direction: 2 }
  });
}
export async function getSalesOrderById(id){ return otGetEntity('sales-order', id); }

// 4) Customer Return (RMA) — search by RMA No or Customer
export async function searchCustomerReturns({ rma, customer, page=1, take=25 }) {
  const Type = await getRecordType('CustomerReturn');
  const Filters = [];
  if (rma) Filters.push({ PropertyName: 'DocNo', Operator: 12, FilterValueArray: rma });
  if (customer) Filters.push({ PropertyName: 'CustomerRef.Name', Operator: 12, FilterValueArray: customer });
  return otList({ Type, Filters: Filters.length?Filters:undefined, PageNumber: page, NumberOfRecords: take });
}
export async function getCustomerReturnById(id){ return otGetEntity('customer-return', id); }

export { getRecordType }; // if you need it elsewhere
