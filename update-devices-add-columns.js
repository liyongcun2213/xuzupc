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

  console.log('开始检查并为 devices 表添加新字段...');

  db.query('DESCRIBE devices', (err, rows) => {
    if (err) {
      console.error('DESCRIBE devices 失败:', err.message);
      db.end();
      return;
    }

    const fields = rows.map(r => r.Field);
    const alters = [];

    if (!fields.includes('device_code')) {
      alters.push("ADD COLUMN device_code VARCHAR(50) NULL AFTER id");
    }
    if (!fields.includes('device_name')) {
      alters.push("ADD COLUMN device_name VARCHAR(255) NULL AFTER device_code");
    }
    if (!fields.includes('product_code')) {
      alters.push("ADD COLUMN product_code VARCHAR(50) NULL AFTER product_id");
    }
    if (!fields.includes('assembly_date')) {
      alters.push("ADD COLUMN assembly_date DATETIME NULL AFTER product_code");
    }
    if (!fields.includes('last_upgrade_date')) {
      alters.push("ADD COLUMN last_upgrade_date DATETIME NULL AFTER assembly_date");
    }

    if (alters.length === 0) {
      console.log('devices 表已包含所有需要的字段，无需修改。');
      db.end();
      return;
    }

    const alterSql = `ALTER TABLE devices ${alters.join(', ')}`;
    console.log('执行 SQL:', alterSql);

    db.query(alterSql, err => {
      if (err) {
        console.error('ALTER TABLE devices 失败:', err.message);
      } else {
        console.log('✓ 成功为 devices 表添加/补齐字段');
      }
      db.end();
    });
  });
});
