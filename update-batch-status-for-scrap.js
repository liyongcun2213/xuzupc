const mysql = require('mysql');

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

  const sql = `ALTER TABLE accessory_batch_stock 
               MODIFY COLUMN status ENUM('in_stock', 'in_use', 'exhausted', 'scrapped') 
               DEFAULT 'in_stock' 
               COMMENT '状态：在库、使用中、已用完、已报废'`;

  db.query(sql, (err) => {
    if (err) {
      console.error('修改表结构失败:', err);
      db.end();
      process.exit(1);
    }

    console.log('✓ 成功为 accessory_batch_stock.status 添加 scrapped 状态');
    db.end();
  });
});
