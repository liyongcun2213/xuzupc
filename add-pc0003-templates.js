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
  
  // 检查是否已存在配件模板
  const productCode = 'PC0003';
  db.query('SELECT COUNT(*) as count FROM device_templates WHERE product_code = ?', [productCode], (err, result) => {
    if (err) {
      console.error('查询设备模板错误:', err);
      db.end();
      return;
    }
    
    if (result[0].count > 0) {
      console.log(`${productCode} 已有配件模板配置，无需重复添加`);
      db.end();
      return;
    }
    
// 查找各类别中的可用配件
  const query = `
    SELECT 
      ac.id as category_id,
      ac.name as category_name,
      a.brand,
      a.model,
      a.name as accessory_name,
      a.unit_price
    FROM accessory_categories ac
    LEFT JOIN accessories a ON ac.id = a.category_id
    WHERE a.stock_quantity > 0
    ORDER BY ac.id, a.unit_price DESC
  `;
  
  db.query(query, (err, accessories) => {
    if (err) {
      console.error('查询配件错误:', err);
      db.end();
      return;
    }
    
    console.log('找到的可用配件:');
    console.log(accessories);
    
    // 按类别分组配件
    const categories = {};
    accessories.forEach(item => {
      if (!categories[item.category_id]) {
        categories[item.category_id] = {
          name: item.category_name,
          accessories: []
        };
      }
      if (item.brand && item.model) {
        categories[item.category_id].accessories.push({
          brand: item.brand,
          model: item.model,
          name: item.accessory_name,
          price: item.unit_price
        });
      }
    });
    
    console.log('\n配件类别分组:');
    console.log(categories);
    
    // 查询产品名称
    db.query('SELECT name FROM products WHERE product_code = ?', [productCode], (err, productResult) => {
      if (err) {
        console.error('查询产品名称错误:', err);
        db.end();
        return;
      }
      
      const productName = productResult.length > 0 ? productResult[0].name : '未知产品';
      
      // 为每个类别选择一个配件（通常选最贵的作为推荐）
      const templates = [];
      Object.keys(categories).forEach(categoryId => {
        const category = categories[categoryId];
        if (category.accessories.length > 0) {
          // 选择第一个（最贵的）配件作为推荐
          const selected = category.accessories[0];
          templates.push([
            productCode,
            productName,
            parseInt(categoryId),
            selected.name,
            selected.brand,
            selected.model,
            1  // 数量默认为1
          ]);
        }
      });
      
      console.log('\n准备插入的模板数据:');
      console.log(templates);
      
      if (templates.length === 0) {
        console.log('没有找到任何可用配件，无法创建模板');
        db.end();
        return;
      }
      
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
          console.log(rows);
          db.end();
        });
      });
    });
  });
});