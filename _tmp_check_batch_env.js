const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

db.connect(err => {
  if (err) {
    console.error('连接失败:', err);
    process.exit(1);
  }
  console.log('已连接到 rental_system');

  db.query("SHOW TABLES LIKE 'accessory_batch_stock'", (err, rows) => {
    if (err) {
      console.error('查询 accessory_batch_stock 表失败:', err);
      return db.end();
    }
    console.log('TABLE accessory_batch_stock:', JSON.stringify(rows));

    db.query("SHOW PROCEDURE STATUS WHERE Db = 'rental_system' AND Name = 'allocate_accessory_batches'", (err, procs) => {
      if (err) {
        console.error('查询 allocate_accessory_batches 存储过程失败:', err);
        return db.end();
      }
      console.log('PROC allocate_accessory_batches:', JSON.stringify(procs));
      db.end();
    });
  });
});
