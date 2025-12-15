const mysql = require('mysql');

// 创建数据库连接
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
  console.log('已连接到数据库');
  
  const productCode = 'PC0003';
  
  // 先查询产品名称
  db.query('SELECT name FROM products WHERE product_code = ?', [productCode], (err, productResult) => {
    if (err) {
      console.error('查询产品名称错误:', err);
      db.end();
      return;
    }
    
    if (productResult.length === 0) {
      console.log(`未找到产品编码 ${productCode}，无法添加模板`);
      db.end();
      return;
    }
    
    const productName = productResult[0].name;
    console.log(`为产品 ${productName}(${productCode}) 创建配件模板`);
    
    // 直接使用预定义的配件模板数据
    const templates = [
      // CPU
      [productCode, productName, 11, 'Intel Core i7-10700', 'Intel', 'i7-10700', 1],
      // 散热器
      [productCode, productName, 12, '酷冷至尊Hyper 212', '酷冷至尊', 'Hyper 212', 1],
      // 主板
      [productCode, productName, 13, '技嘉B560M DS3H', '技嘉', 'B560M DS3H', 1],
      // 内存
      [productCode, productName, 14, '威刚32GB DDR4 3200', '威刚', '32GB DDR4 3200', 1],
      // 硬盘
      [productCode, productName, 15, '三星1TB 970 EVO', '三星', '970 EVO 1TB', 1],
      // 显卡
      [productCode, productName, 16, '华硕RTX 3060 12G', '华硕', 'RTX 3060 12G', 1],
      // 机箱
      [productCode, productName, 17, '酷冷至尊MasterBox Q300L', '酷冷至尊', 'MasterBox Q300L', 1],
      // 电源
      [productCode, productName, 18, '酷冷至尊GX550', '酷冷至尊', 'GX550', 1],
      // 显示器
      [productCode, productName, 19, '飞利浦32英寸 4K', '飞利浦', '328E1', 1]
    ];
    
    // 检查是否已存在配件模板
    db.query('SELECT COUNT(*) as count FROM device_templates WHERE product_code = ?', [productCode], (err, result) => {
      if (err) {
        console.error('查询设备模板错误:', err);
        db.end();
        return;
      }
      
      if (result[0].count > 0) {
        console.log(`${productCode} 已有配件模板配置，正在删除旧模板...`);
        
        // 删除旧模板
        db.query('DELETE FROM device_templates WHERE product_code = ?', [productCode], (err, deleteResult) => {
          if (err) {
            console.error('删除旧模板错误:', err);
            db.end();
            return;
          }
          
          console.log(`已删除 ${deleteResult.affectedRows} 个旧模板`);
          
          // 插入新模板
          insertTemplates();
        });
      } else {
        // 直接插入新模板
        insertTemplates();
      }
      
      function insertTemplates() {
        // 插入模板数据
        const insertQuery = `
          INSERT INTO device_templates 
          (product_code, product_name, accessory_category_id, accessory_name, brand, model, quantity) 
          VALUES ?
        `;
        
        db.query(insertQuery, [templates], (err, result) => {
          if (err) {
            console.error('插入模板数据错误:', err);
            db.end();
            return;
          }
          
          console.log(`成功为 ${productCode} 创建了 ${result.affectedRows} 个配件模板`);
          
          // 查询结果验证
          db.query('SELECT * FROM device_templates WHERE product_code = ?', [productCode], (err, rows) => {
            if (err) {
              console.error('验证查询错误:', err);
              db.end();
              return;
            }
            
            console.log('\n验证查询结果:');
            rows.forEach(row => {
              console.log(`${row.accessory_category_id} ${row.accessory_name} ${row.brand} ${row.model}`);
            });
            db.end();
          });
        });
      }
    });
  });
});