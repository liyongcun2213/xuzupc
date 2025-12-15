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

  db.query("SELECT id, device_code FROM devices WHERE device_code LIKE 'PC0001-%' ORDER BY id", (err, devices) => {
    if (err) {
      console.error('查询设备失败:', err);
      process.exit(1);
    }

    console.log('devices:', devices);

    const target = devices.find((d) => d.device_code === 'PC0001-002') || devices[devices.length - 1];
    if (!target) {
      console.log('未找到目标设备');
      db.end();
      return;
    }

    console.log('使用设备:', target);

    db.query(
      'SELECT id, accessory_id, accessory_name, brand, model, quantity, batch_stock_id FROM device_assemblies WHERE device_id = ? ORDER BY id',
      [target.id],
      (err2, rows) => {
        if (err2) {
          console.error('查询组装记录失败:', err2);
          process.exit(1);
        }

        console.log('device_id', target.id, 'assemblies:');
        console.log(JSON.stringify(rows, null, 2));
        db.end();
      }
    );
  });
});
