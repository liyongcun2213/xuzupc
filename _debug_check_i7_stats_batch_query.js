const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

db.connect((err) => {
  if (err) {
    console.error('DB connect error:', err);
    process.exit(1);
  }

  db.query("SELECT id, name FROM accessories WHERE name LIKE '%i7-8700k%'", (e, accessories) => {
    if (e) {
      console.error('Query accessories error:', e);
      db.end();
      return;
    }

    console.log('accessories:', accessories);
    if (!accessories || accessories.length === 0) {
      console.log('No accessories matched i7-8700k');
      db.end();
      return;
    }

    const id = accessories[0].id;
    console.log('Using accessory_id =', id);

    const sql = `
      SELECT 
        a.id AS accessory_id,
        a.name,
        pb.batch_no,
        abs.purchase_price,
        SUM(abs.quantity) AS purchase_quantity,
        SUM(abs.available_quantity) AS available_quantity,
        SUM(abs.quantity - abs.available_quantity) AS out_quantity,
        COALESCE(latest_price.price, a.purchase_price) AS current_price
      FROM accessory_batch_stock abs
      JOIN accessories a ON abs.accessory_id = a.id
      LEFT JOIN purchase_batches pb ON abs.batch_id = pb.id
      LEFT JOIN (
          SELECT aph1.*
          FROM accessory_price_history aph1
          JOIN (
              SELECT accessory_id, MAX(month_year) AS max_month_year 
              FROM accessory_price_history 
              GROUP BY accessory_id
          ) latest ON aph1.accessory_id = latest.accessory_id 
                   AND aph1.month_year = latest.max_month_year
      ) latest_price ON a.id = latest_price.accessory_id
      WHERE a.status != 'scrapped'
        AND a.id = ?
      GROUP BY 
        a.id, a.name,
        pb.batch_no, abs.purchase_price
      ORDER BY pb.batch_no, abs.purchase_price
    `;

    db.query(sql, [id], (e2, rows) => {
      if (e2) {
        console.error('Query batchDetails-like sql error:', e2);
      } else {
        console.log('batchDetails-like rows:', rows);
      }
      db.end();
    });
  });
});
