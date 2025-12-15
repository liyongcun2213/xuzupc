const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

db.connect();

console.log('开始修改 accessories.status 枚举类型...');

db.query(
  "ALTER TABLE accessories MODIFY COLUMN status ENUM('active','inactive','in_warehouse','assembled','scrapped') DEFAULT 'in_warehouse'",
  (err) => {
    if (err) {
      console.error('修改枚举失败:', err);
      db.end();
      return;
    }

    console.log('✓ accessories.status 枚举已更新为: active, inactive, in_warehouse, assembled, scrapped');

    db.query('DESCRIBE accessories', (e, rows) => {
      if (e) {
        console.error(e);
      } else {
        console.table(rows.filter(r => r.Field === 'status'));
      }
      db.end();
    });
  }
);
