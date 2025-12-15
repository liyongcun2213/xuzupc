const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system',
  charset: 'utf8mb4',
});

db.connect(err => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  }

  const updates = [
    "UPDATE devices SET device_code = 'PC0002-001', product_code = 'PC0002' WHERE id = 1",
    "UPDATE devices SET device_code = 'PC0002-002', product_code = 'PC0002' WHERE id = 2",
  ];

  let index = 0;

  const runNext = () => {
    if (index >= updates.length) {
      console.log('所有初始设备编号已更新');
      db.end();
      return;
    }

    const sql = updates[index];
    db.query(sql, err => {
      if (err) {
        console.error('执行失败:', err.message, '\nSQL:', sql);
        db.end();
        return;
      }
      console.log('执行成功:', sql);
      index += 1;
      runNext();
    });
  };

  runNext();
});
