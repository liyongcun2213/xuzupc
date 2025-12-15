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

  const sql = `
    UPDATE devices d
    INNER JOIN device_upgrades du ON du.device_id = d.id
    SET d.status = 'upgraded'
  `;

  console.log('执行 SQL:', sql.replace(/\s+/g, ' '));

  db.query(sql, err => {
    if (err) {
      console.error('更新已升级设备状态失败:', err.message);
      process.exit(1);
    }
    console.log('✓ 已将所有有升级记录的设备状态更新为 upgraded');
    db.end();
  });
});
