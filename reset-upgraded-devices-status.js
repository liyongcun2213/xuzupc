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

  const sql = "UPDATE devices SET status = 'in_warehouse' WHERE status = 'upgraded'";
  console.log('执行 SQL:', sql);

  db.query(sql, err => {
    if (err) {
      console.error('重置设备状态失败:', err.message);
      process.exit(1);
    }
    console.log('✓ 已将所有 status = \'upgraded\' 的设备恢复为 in_warehouse');
    db.end();
  });
});
