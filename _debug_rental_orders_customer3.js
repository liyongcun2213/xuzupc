const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system',
});

db.connect((err) => {
  if (err) {
    console.error('连接失败:', err);
    process.exit(1);
  }

  db.query(
    "SELECT id, order_number, payment_cycle, start_date, end_date, status FROM rental_orders WHERE customer_id = 3 ORDER BY start_date",
    (e, rows) => {
      if (e) {
        console.error('查询失败:', e);
      } else {
        console.log(JSON.stringify(rows, null, 2));
      }
      db.end();
    }
  );
});
