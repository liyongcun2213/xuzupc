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
  console.log('\n开始同步 customer_accounts 到 customers 表的客户...');

  // 提示当前账户数量
  db.query('SELECT COUNT(*) AS cnt FROM customer_accounts', (err, rows) => {
    if (!err && rows && rows[0]) {
      console.log(`当前 customer_accounts 记录数: ${rows[0].cnt}`);
    }

    // 删除那些在 customers 中已经不存在的账户（老的 partners 账户）
    const deleteSql = `
      DELETE ca FROM customer_accounts ca
      LEFT JOIN customers c ON ca.customer_id = c.id
      WHERE c.id IS NULL
    `;

    db.query(deleteSql, (err, result) => {
      if (err) {
        console.error('清理无效账户失败:', err);
        db.end();
        return;
      }

      console.log(`已删除与 customers 无关联的旧账户: ${result.affectedRows} 条`);

      // 为所有 active 状态的 customers 建立或更新账户
      const insertSql = `
        INSERT INTO customer_accounts (customer_id, customer_code, customer_name, prepaid_amount, consumed_amount, balance, status)
        SELECT 
          c.id AS customer_id,
          CONCAT('KH', LPAD(c.id, 4, '0')) AS customer_code,
          c.name AS customer_name,
          0.00 AS prepaid_amount,
          0.00 AS consumed_amount,
          0.00 AS balance,
          'paid' AS status
        FROM customers c
        WHERE c.status = 'active'
        ON DUPLICATE KEY UPDATE
          customer_name = VALUES(customer_name),
          customer_code = VALUES(customer_code)
      `;

      db.query(insertSql, (err, result2) => {
        if (err) {
          console.error('同步客户账户失败:', err);
          db.end();
          return;
        }

        console.log(`插入/更新 customer_accounts 记录: 受影响行数 ${result2.affectedRows}`);

        db.query('SELECT COUNT(*) AS cnt FROM customer_accounts', (err, rows2) => {
          if (!err && rows2 && rows2[0]) {
            console.log(`同步后 customer_accounts 记录数: ${rows2[0].cnt}`);
          }

          console.log('\n同步完成。customer_accounts 现在只针对 customers 表的客户。');
          db.end();
        });
      });
    });
  });
});
