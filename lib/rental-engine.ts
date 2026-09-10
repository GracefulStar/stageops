export type Query = { sql: string; params: (string | number)[] };
export type BookingLine = {
  id: string;
  productId: string;
  quantity: number;
  start: string;
  endExclusive: string;
};
export type Booking = {
  id: string;
  number: string;
  scenarioId: string;
  requestId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: string;
  lines: BookingLine[];
};

// Allocation happens inside INSERT ... SELECT in a single database transaction.
// Reading availability first and writing later would allow concurrent double bookings.
export function orderQueries(order: Booking): Query[] {
  const queries: Query[] = [
    {
      sql: `INSERT INTO orders (id,number,scenario_id,request_id,first_name,last_name,email,phone,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      params: [
        order.id,
        order.number,
        order.scenarioId,
        order.requestId,
        order.firstName,
        order.lastName,
        order.email,
        order.phone,
        order.createdAt,
      ],
    },
  ];
  for (const line of order.lines) {
    queries.push({
      sql: `INSERT INTO order_lines (id,order_id,product_id,quantity,start_date,end_exclusive) VALUES (?,?,?,?,?,?)`,
      params: [
        line.id,
        order.id,
        line.productId,
        line.quantity,
        line.start,
        line.endExclusive,
      ],
    });
    queries.push({
      sql: `INSERT INTO reservations (asset_id,line_id,start_date,end_exclusive)
        SELECT a.id,?,?,? FROM assets a
        WHERE a.scenario_id=? AND a.product_id=? AND a.available_from<=?
          AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.asset_id=a.id AND r.start_date<? AND r.end_exclusive>?)
        ORDER BY a.id LIMIT ?`,
      params: [
        line.id,
        line.start,
        line.endExclusive,
        order.scenarioId,
        line.productId,
        line.start,
        line.endExclusive,
        line.start,
        line.quantity,
      ],
    });
    queries.push({
      sql: `INSERT INTO purchase_requests (id,line_id,quantity,needed_by,status,created_at)
        SELECT ?,id,quantity-(SELECT COUNT(*) FROM reservations WHERE line_id=order_lines.id),start_date,'requested',?
        FROM order_lines WHERE id=? AND quantity>(SELECT COUNT(*) FROM reservations WHERE line_id=order_lines.id)`,
      params: [`purchase-${line.id}`, order.createdAt, line.id],
    });
    queries.push({
      sql: `INSERT INTO system_events (id,order_id,line_id,type,quantity,created_at)
        SELECT ?,?,?, 'stock_shortage',quantity,? FROM purchase_requests WHERE line_id=?`,
      params: [`event-${line.id}`, order.id, line.id, order.createdAt, line.id],
    });
  }
  return queries;
}

export function seedAssetQuery(
  scenarioId: string,
  productId: string,
  total: number,
  freeUnits: number,
  today: string,
  releaseDate: string,
  laterDate: string,
): Query {
  return {
    sql: `WITH RECURSIVE units(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM units WHERE n<?)
      INSERT INTO assets (id,scenario_id,product_id,available_from)
      SELECT ? || ':' || ? || ':' || printf('%03d',n),?, ?, CASE WHEN n<=? THEN ? WHEN n=? THEN ? ELSE ? END FROM units`,
    params: [
      total,
      scenarioId,
      productId,
      scenarioId,
      productId,
      freeUnits,
      today,
      freeUnits + 1,
      releaseDate,
      laterDate,
    ],
  };
}

export function stockQuery(scenarioId: string, today: string): Query {
  return {
    sql: `WITH candidates(asset_id,day) AS (
        SELECT id,MAX(available_from,?) FROM assets WHERE scenario_id=?
        UNION SELECT r.asset_id,r.end_exclusive FROM reservations r JOIN assets a ON a.id=r.asset_id WHERE a.scenario_id=? AND r.end_exclusive>=MAX(a.available_from,?)
      ), next_free AS (
        SELECT c.asset_id,MIN(c.day) AS day FROM candidates c
        WHERE NOT EXISTS (SELECT 1 FROM reservations r WHERE r.asset_id=c.asset_id AND r.start_date<=c.day AND r.end_exclusive>c.day)
        GROUP BY c.asset_id
      )
      SELECT a.product_id AS productId,COUNT(*) AS total,
        SUM(CASE WHEN f.day<=? THEN 1 ELSE 0 END) AS inWarehouse,
        SUM(CASE WHEN f.day>? THEN 1 ELSE 0 END) AS circulating,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.asset_id=a.id AND r.end_exclusive>?) THEN 1 ELSE 0 END) AS reserved,
        CASE WHEN MIN(f.day)<=? THEN NULL ELSE MIN(f.day) END AS firstFree
      FROM assets a JOIN next_free f ON f.asset_id=a.id WHERE a.scenario_id=? GROUP BY a.product_id`,
    params: [
      today,
      scenarioId,
      scenarioId,
      today,
      today,
      today,
      today,
      today,
      scenarioId,
    ],
  };
}
