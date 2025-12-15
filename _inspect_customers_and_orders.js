const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system',
});

db.connect((err) => {
  if (err) {
    console.error('数据库连接失败:', err);
    return;
  }

  console.log('数据库连接成功');

  // 查看 customers 表结构和前几条数据
  db.query('DESCRIBE customers', (err, fields) => {
    if (err) {
      console.error('DESCRIBE customers 失败:', err);
      db.end();
      return;
    }

    console.log('\ncustomers 表结构:');
    fields.forEach((f) => {
      console.log(`${f.Field}\t${f.Type}\tNULL=${f.Null}\tKEY=${f.Key}\tDEFAULT=${f.Default}`);
    });

    db.query('SELECT id, name, contact_person, phone FROM customers ORDER BY id LIMIT 10', (err, rows) => {
      if (err) {
        console.error('查询 customers 失败:', err);
        db.end();
        return;
      }

      console.log('\ncustomers 示例数据:');
      rows.forEach((r) => {
        console.log(`  id=${r.id}, name=${r.name}, contact=${r.contact_person}, phone=${r.phone}`);
      });

      // 查看 rental_orders 与 customers 关系
      db.query(
        'SELECT ro.id, ro.customer_id, ro.order_number, c.name AS customer_name FROM rental_orders ro LEFT JOIN customers c ON ro.customer_id = c.id ORDER BY ro.id LIMIT 10',
        (err, orders) => {
          if (err) {
            console.error('查询 rental_orders 失败:', err);
            db.end();
            return;
          }

          console.log('\nrental_orders 示例数据:');
          orders.forEach((o) => {
            console.log(`  order_id=${o.id}, customer_id=${o.customer_id}, customer_name=${o.customer_name}, order_number=${o.order_number}`);
          });

          db.end();
        }
      );
    });
  });
});
