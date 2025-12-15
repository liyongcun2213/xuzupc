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

  const sql = "ALTER TABLE devices MODIFY COLUMN status ENUM('in_warehouse','available','rented','maintenance','retired','upgraded') DEFAULT 'in_warehouse'";
  console.log('执行 SQL:', sql);

  db.query(sql, err => {
    if (err) {
      console.error('修改 devices.status 枚举失败:', err.message);
      process.exit(1);
    }
    console.log('✓ 成功更新 devices.status 枚举，新增状态：upgraded');
    db.end();
  });
});
