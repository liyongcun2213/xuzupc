const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

db.connect(err => {
  if (err) {
    console.error('连接数据库失败:', err);
    process.exit(1);
  }
  console.log('已连接到 rental_system，开始修复批次相关表结构...');

  const statements = [
    // 为 device_assemblies 补充批次相关字段和索引
    "ALTER TABLE device_assemblies ADD COLUMN batch_stock_id INT NULL COMMENT '批次库存ID' AFTER accessory_id",
    "ALTER TABLE device_assemblies ADD COLUMN unique_batch_id VARCHAR(20) NULL COMMENT '唯一批次ID' AFTER batch_stock_id",
    "ALTER TABLE device_assemblies ADD COLUMN purchase_price DECIMAL(10,2) NULL COMMENT '采购价格' AFTER unique_batch_id",
    "ALTER TABLE device_assemblies ADD INDEX idx_batch_stock_id (batch_stock_id)",

    // 修正视图，避免 purchase_price 歧义
    'DROP VIEW IF EXISTS v_accessory_stock_summary',
    `CREATE VIEW v_accessory_stock_summary AS
      SELECT 
        a.id AS accessory_id,
        a.name AS accessory_name,
        a.brand,
        a.model,
        ac.name AS category_name,
        ABS(SUM(abs.available_quantity)) AS total_stock,
        COUNT(*) AS batch_count,
        AVG(abs.purchase_price) AS avg_price,
        MIN(abs.purchase_price) AS min_price,
        MAX(abs.purchase_price) AS max_price
      FROM accessories a
      LEFT JOIN accessory_categories ac ON a.category_id = ac.id
      LEFT JOIN accessory_batch_stock abs ON a.id = abs.accessory_id
      WHERE abs.status != 'exhausted'
      GROUP BY a.id, a.name, a.brand, a.model, ac.name
      ORDER BY a.name`
  ];

  let index = 0;

  function runNext() {
    if (index >= statements.length) {
      console.log('批次相关表结构修复完成');
      db.end();
      return;
    }

    const sql = statements[index++];
    console.log('\n执行 SQL:', sql.split('\n')[0]);

    db.query(sql, (err) => {
      if (err) {
        console.error('执行出错:', err.code, '-', err.sqlMessage);
      } else {
        console.log('执行成功');
      }
      runNext();
    });
  }

  runNext();
});
