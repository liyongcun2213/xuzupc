const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

db.connect((err) => {
  if (err) {
    console.error('连接失败:', err);
    process.exit(1);
  }

  console.log('开始清理 device_assemblies 中的重复记录...');

  const sql = `
    DELETE da1
    FROM device_assemblies da1
    JOIN device_assemblies da2
      ON da1.device_id = da2.device_id
     AND da1.accessory_id = da2.accessory_id
     AND IFNULL(da1.batch_stock_id, 0) = IFNULL(da2.batch_stock_id, 0)
     AND da1.id > da2.id
    WHERE da1.batch_stock_id IS NULL;
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error('清理重复记录失败:', err);
      process.exit(1);
    }

    console.log('清理完成，受影响行数:', result.affectedRows);
    db.end();
  });
});
