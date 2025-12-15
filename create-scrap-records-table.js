const mysql = require('mysql');
const fs = require('fs');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

db.connect((err) => {
  if (err) {
    console.error('数据库连接失败:', err);
    process.exit(1);
  }

  console.log('已连接到数据库');

  const sql = fs.readFileSync('create-accessory-scrap-records.sql', 'utf8');

  db.query(sql, (err) => {
    if (err) {
      console.error('创建表失败:', err);
      db.end();
      process.exit(1);
    }

    console.log('✓ 成功创建 accessory_scrap_records 表');
    db.end();
  });
});
