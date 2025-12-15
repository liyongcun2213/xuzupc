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

  db.query('DESCRIBE devices', (err, rows) => {
    if (err) {
      console.error('DESCRIBE devices 失败:', err.message);
    } else {
      console.log('DESCRIBE devices 列:');
      rows.forEach(r => {
        console.log(`${r.Field}\t${r.Type}\t${r.Null}\t${r.Key}\t${r.Default}\t${r.Extra}`);
      });
    }
    db.end();
  });
});
