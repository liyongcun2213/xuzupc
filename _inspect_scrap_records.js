const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

connection.connect(err => {
  if (err) {
    console.error('连接数据库失败:', err);
    process.exit(1);
  }

  console.log('已连接到数据库');

  const sql = `
    SELECT 
      id,
      accessory_id,
      device_id,
      device_code,
      quantity,
      purchase_price,
      scrap_reason,
      scrap_date
    FROM accessory_scrap_records
    ORDER BY id DESC
    LIMIT 20
  `;

  connection.query(sql, (qErr, rows) => {
    if (qErr) {
      console.error('查询报废记录失败:', qErr);
      connection.end();
      process.exit(1);
    }

    console.log('最近 20 条配件报废记录:');
    rows.forEach(row => {
      console.log(row);
    });

    connection.end();
  });
});
