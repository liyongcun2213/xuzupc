const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system',
  charset: 'utf8mb4',
});

const deviceCode = process.argv[2] || 'PC0003-001';

db.connect(err => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  }

  const sql = `
    SELECT 
      d.id as device_id,
      d.device_code,
      du.id as upgrade_id,
      du.upgrade_type,
      du.old_accessory_id,
      du.new_accessory_id,
      du.accessory_name,
      a_old.name as old_accessory_name,
      a_new.name as new_accessory_name
    FROM devices d
    LEFT JOIN device_upgrades du ON du.device_id = d.id
    LEFT JOIN accessories a_old ON du.old_accessory_id = a_old.id
    LEFT JOIN accessories a_new ON du.new_accessory_id = a_new.id
    WHERE d.device_code = ?
    ORDER BY du.upgrade_date DESC
  `;

  db.query(sql, [deviceCode], (err, rows) => {
    if (err) {
      console.error('查询失败:', err.message);
    } else {
      console.log('设备升级记录:', JSON.stringify(rows, null, 2));
    }
    db.end();
  });
});
