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
        accessory_id,
        batch_id,
        purchase_price,
        SUM(quantity) AS total_quantity,
        SUM(available_quantity) AS total_available,
        SUM(used_quantity) AS total_used,
        SUM(COALESCE(scrapped_quantity, 0)) AS total_scrapped
      FROM accessory_batch_stock
      WHERE accessory_id = ?
      GROUP BY accessory_id, batch_id, purchase_price
      ORDER BY batch_id, purchase_price
    `;

    db.query(sql, [id], (e2, rows) => {
      if (e2) {
        console.error('Query batch stock error:', e2);
      } else {
        console.log('batch_stock summary:', rows);
      }
      db.end();
    });
  });
});
